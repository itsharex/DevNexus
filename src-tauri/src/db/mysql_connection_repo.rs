use rusqlite::{params, Connection, OptionalExtension};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MysqlConnectionInfo {
    pub id: String,
    pub name: String,
    pub group_name: Option<String>,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub default_database: Option<String>,
    pub charset: Option<String>,
    pub ssl_mode: Option<String>,
    pub connect_timeout: u64,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MysqlConnectionForm {
    pub id: Option<String>,
    pub name: String,
    pub group_name: Option<String>,
    pub host: String,
    pub port: Option<u16>,
    pub username: String,
    pub password: Option<String>,
    pub default_database: Option<String>,
    pub charset: Option<String>,
    pub ssl_mode: Option<String>,
    pub connect_timeout: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct MysqlConnectionSecret {
    pub password: Option<String>,
}

fn open_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let path = crate::db::init::db_path(app_handle)?;
    Connection::open(path).map_err(|err| format!("failed to open db: {err}"))
}

fn trim_option(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

fn row_to_info(row: &rusqlite::Row<'_>) -> rusqlite::Result<MysqlConnectionInfo> {
    let port: i64 = row.get(5)?;
    let timeout: i64 = row.get(10)?;
    Ok(MysqlConnectionInfo {
        id: row.get(0)?,
        name: row.get(1)?,
        group_name: row.get(2)?,
        host: row.get(3)?,
        username: row.get(4)?,
        port: port as u16,
        default_database: row.get(6)?,
        charset: row.get(7)?,
        ssl_mode: row.get(8)?,
        created_at: row.get(9)?,
        connect_timeout: timeout.max(1) as u64,
    })
}

pub fn list_mysql_connections(app_handle: &tauri::AppHandle) -> Result<Vec<MysqlConnectionInfo>, String> {
    let conn = open_db(app_handle)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, name, group_name, host, username, port, default_database,
                   charset, ssl_mode, created_at, connect_timeout
            FROM mysql_connections
            ORDER BY created_at DESC
            "#,
        )
        .map_err(|err| format!("prepare list mysql query failed: {err}"))?;
    let rows = stmt
        .query_map([], row_to_info)
        .map_err(|err| format!("query mysql connections failed: {err}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("parse mysql connection row failed: {err}"))
}

pub fn get_mysql_connection(
    app_handle: &tauri::AppHandle,
    id: &str,
) -> Result<Option<MysqlConnectionInfo>, String> {
    let conn = open_db(app_handle)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, name, group_name, host, username, port, default_database,
                   charset, ssl_mode, created_at, connect_timeout
            FROM mysql_connections
            WHERE id = ?1
            "#,
        )
        .map_err(|err| format!("prepare get mysql query failed: {err}"))?;
    stmt.query_row(params![id], row_to_info)
        .optional()
        .map_err(|err| format!("get mysql connection failed: {err}"))
}

pub fn save_mysql_connection(
    app_handle: &tauri::AppHandle,
    form: MysqlConnectionForm,
) -> Result<String, String> {
    let conn = open_db(app_handle)?;
    let id = form.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let created_at = chrono::Utc::now().to_rfc3339();
    let host = form.host.trim().to_string();
    let username = form.username.trim().to_string();
    if form.name.trim().is_empty() {
        return Err("name is required".to_string());
    }
    if host.is_empty() {
        return Err("host is required".to_string());
    }
    if username.is_empty() {
        return Err("username is required".to_string());
    }

    let current_password = get_mysql_secret(app_handle, &id)?.and_then(|secret| secret.password);
    let raw_password = form.password.unwrap_or_default();
    let password = if raw_password.is_empty() {
        current_password.unwrap_or_default()
    } else {
        raw_password
    };
    let password_encrypted = if password.is_empty() {
        None
    } else {
        Some(crate::crypto::encrypt(app_handle, &password)?)
    };

    conn.execute(
        r#"
        INSERT INTO mysql_connections (
          id, name, group_name, host, port, username, password_encrypted,
          default_database, charset, ssl_mode, connect_timeout, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          group_name = excluded.group_name,
          host = excluded.host,
          port = excluded.port,
          username = excluded.username,
          password_encrypted = excluded.password_encrypted,
          default_database = excluded.default_database,
          charset = excluded.charset,
          ssl_mode = excluded.ssl_mode,
          connect_timeout = excluded.connect_timeout
        "#,
        params![
            id,
            form.name.trim(),
            trim_option(form.group_name),
            host,
            form.port.unwrap_or(3306),
            username,
            password_encrypted,
            trim_option(form.default_database),
            trim_option(form.charset).or_else(|| Some("utf8mb4".to_string())),
            trim_option(form.ssl_mode).or_else(|| Some("preferred".to_string())),
            form.connect_timeout.unwrap_or(10).max(1),
            created_at,
        ],
    )
    .map_err(|err| format!("save mysql connection failed: {err}"))?;

    Ok(id)
}

pub fn delete_mysql_connection(app_handle: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let conn = open_db(app_handle)?;
    conn.execute("DELETE FROM mysql_connections WHERE id = ?1", params![id])
        .map_err(|err| format!("delete mysql connection failed: {err}"))?;
    Ok(())
}

pub fn get_mysql_secret(
    app_handle: &tauri::AppHandle,
    id: &str,
) -> Result<Option<MysqlConnectionSecret>, String> {
    let conn = open_db(app_handle)?;
    let encrypted = conn
        .query_row(
            "SELECT password_encrypted FROM mysql_connections WHERE id = ?1",
            params![id],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .map_err(|err| format!("query mysql secret failed: {err}"))?;

    encrypted
        .map(|password| {
            Ok(MysqlConnectionSecret {
                password: password
                    .map(|value| crate::crypto::decrypt(app_handle, &value))
                    .transpose()?,
            })
        })
        .transpose()
}
