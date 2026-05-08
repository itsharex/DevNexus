use rusqlite::{params, Connection, OptionalExtension};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoConnectionInfo {
    pub id: String,
    pub name: String,
    pub group_name: Option<String>,
    pub mode: String,
    pub host: Option<String>,
    pub port: u16,
    pub username: Option<String>,
    pub auth_database: Option<String>,
    pub default_database: Option<String>,
    pub replica_set: Option<String>,
    pub tls: bool,
    pub srv: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoConnectionForm {
    pub id: Option<String>,
    pub name: String,
    pub group_name: Option<String>,
    pub mode: String,
    pub uri: Option<String>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub auth_database: Option<String>,
    pub default_database: Option<String>,
    pub replica_set: Option<String>,
    pub tls: Option<bool>,
    pub srv: Option<bool>,
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

fn row_to_info(row: &rusqlite::Row<'_>) -> rusqlite::Result<MongoConnectionInfo> {
    let tls: i64 = row.get(11)?;
    let srv: i64 = row.get(12)?;
    let port_i64: i64 = row.get(6)?;
    Ok(MongoConnectionInfo {
        id: row.get(0)?,
        name: row.get(1)?,
        group_name: row.get(2)?,
        mode: row.get(3)?,
        host: row.get(4)?,
        username: row.get(5)?,
        port: port_i64 as u16,
        auth_database: row.get(7)?,
        default_database: row.get(8)?,
        replica_set: row.get(9)?,
        created_at: row.get(10)?,
        tls: tls != 0,
        srv: srv != 0,
    })
}

pub fn list_mongo_connections(
    app_handle: &tauri::AppHandle,
) -> Result<Vec<MongoConnectionInfo>, String> {
    let conn = open_db(app_handle)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT
              id, name, group_name, mode, host, username, port, auth_database,
              default_database, replica_set, created_at, tls, srv
            FROM mongodb_connections
            ORDER BY created_at DESC
            "#,
        )
        .map_err(|err| format!("prepare list mongodb query failed: {err}"))?;
    let rows = stmt
        .query_map([], row_to_info)
        .map_err(|err| format!("query mongodb connections failed: {err}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("parse mongodb connection row failed: {err}"))
}

pub fn get_mongo_connection(
    app_handle: &tauri::AppHandle,
    id: &str,
) -> Result<Option<MongoConnectionInfo>, String> {
    let conn = open_db(app_handle)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT
              id, name, group_name, mode, host, username, port, auth_database,
              default_database, replica_set, created_at, tls, srv
            FROM mongodb_connections
            WHERE id = ?1
            "#,
        )
        .map_err(|err| format!("prepare get mongodb query failed: {err}"))?;
    stmt.query_row(params![id], row_to_info)
        .optional()
        .map_err(|err| format!("get mongodb connection failed: {err}"))
}

pub fn save_mongo_connection(
    app_handle: &tauri::AppHandle,
    form: MongoConnectionForm,
) -> Result<String, String> {
    let conn = open_db(app_handle)?;
    let id = form.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let created_at = chrono::Utc::now().to_rfc3339();
    let mode = form.mode.trim().to_string();
    if mode != "uri" && mode != "form" {
        return Err("mode must be uri or form".to_string());
    }

    let current = get_mongo_secret(app_handle, &id)?;
    let current_uri = current.as_ref().and_then(|secret| secret.uri.clone());
    let current_password = current.and_then(|secret| secret.password);
    let raw_uri = form.uri.unwrap_or_default();
    let uri = if raw_uri.trim().is_empty() {
        current_uri.unwrap_or_default()
    } else {
        raw_uri.trim().to_string()
    };
    let raw_password = form.password.unwrap_or_default();
    let password = if raw_password.is_empty() {
        current_password.unwrap_or_default()
    } else {
        raw_password
    };
    if mode == "uri" && uri.trim().is_empty() {
        return Err("uri is required".to_string());
    }
    if mode == "form" && trim_option(form.host.clone()).is_none() {
        return Err("host is required".to_string());
    }

    let uri_encrypted = if uri.trim().is_empty() {
        None
    } else {
        Some(crate::crypto::encrypt(app_handle, &uri)?)
    };
    let password_encrypted = if password.is_empty() {
        None
    } else {
        Some(crate::crypto::encrypt(app_handle, &password)?)
    };

    conn.execute(
        r#"
        INSERT INTO mongodb_connections (
          id, name, group_name, mode, uri_encrypted, host, port, username,
          password_encrypted, auth_database, default_database, replica_set, tls, srv, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          group_name = excluded.group_name,
          mode = excluded.mode,
          uri_encrypted = excluded.uri_encrypted,
          host = excluded.host,
          port = excluded.port,
          username = excluded.username,
          password_encrypted = excluded.password_encrypted,
          auth_database = excluded.auth_database,
          default_database = excluded.default_database,
          replica_set = excluded.replica_set,
          tls = excluded.tls,
          srv = excluded.srv
        "#,
        params![
            id,
            form.name.trim(),
            trim_option(form.group_name),
            mode,
            uri_encrypted,
            trim_option(form.host),
            form.port.unwrap_or(27017),
            trim_option(form.username),
            password_encrypted,
            trim_option(form.auth_database),
            trim_option(form.default_database),
            trim_option(form.replica_set),
            if form.tls.unwrap_or(false) { 1 } else { 0 },
            if form.srv.unwrap_or(false) { 1 } else { 0 },
            created_at
        ],
    )
    .map_err(|err| format!("save mongodb connection failed: {err}"))?;

    Ok(id)
}

pub fn delete_mongo_connection(app_handle: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let conn = open_db(app_handle)?;
    conn.execute("DELETE FROM mongodb_connections WHERE id = ?1", params![id])
        .map_err(|err| format!("delete mongodb connection failed: {err}"))?;
    Ok(())
}

#[derive(Debug, Clone)]
pub struct MongoConnectionSecret {
    pub uri: Option<String>,
    pub password: Option<String>,
}

pub fn get_mongo_secret(
    app_handle: &tauri::AppHandle,
    id: &str,
) -> Result<Option<MongoConnectionSecret>, String> {
    let conn = open_db(app_handle)?;
    let encrypted = conn
        .query_row(
            "SELECT uri_encrypted, password_encrypted FROM mongodb_connections WHERE id = ?1",
            params![id],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                ))
            },
        )
        .optional()
        .map_err(|err| format!("query mongodb secret failed: {err}"))?;

    encrypted
        .map(|(uri, password)| {
            Ok(MongoConnectionSecret {
                uri: uri
                    .map(|value| crate::crypto::decrypt(app_handle, &value))
                    .transpose()?,
                password: password
                    .map(|value| crate::crypto::decrypt(app_handle, &value))
                    .transpose()?,
            })
        })
        .transpose()
}
