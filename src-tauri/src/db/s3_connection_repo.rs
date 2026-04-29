use rusqlite::{params, Connection, OptionalExtension};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct S3ConnectionInfo {
    pub id: String,
    pub name: String,
    pub group_name: Option<String>,
    pub provider: String,
    pub endpoint: Option<String>,
    pub region: String,
    pub access_key_id: String,
    pub path_style: bool,
    pub default_bucket: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct S3ConnectionForm {
    pub id: Option<String>,
    pub name: String,
    pub group_name: Option<String>,
    pub provider: String,
    pub endpoint: Option<String>,
    pub region: String,
    pub access_key_id: String,
    pub secret_access_key: Option<String>,
    pub path_style: Option<bool>,
    pub default_bucket: Option<String>,
}

fn open_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let path = crate::db::init::db_path(app_handle)?;
    Connection::open(path).map_err(|err| format!("failed to open db: {err}"))
}

pub fn list_s3_connections(app_handle: &tauri::AppHandle) -> Result<Vec<S3ConnectionInfo>, String> {
    let conn = open_db(app_handle)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT
              id, name, group_name, provider, endpoint, region, access_key_id,
              path_style, default_bucket, created_at
            FROM s3_connections
            ORDER BY created_at DESC
            "#,
        )
        .map_err(|err| format!("prepare list s3 query failed: {err}"))?;

    let rows = stmt
        .query_map([], |row| {
            let path_style: i64 = row.get(7)?;
            Ok(S3ConnectionInfo {
                id: row.get(0)?,
                name: row.get(1)?,
                group_name: row.get(2)?,
                provider: row.get(3)?,
                endpoint: row.get(4)?,
                region: row.get(5)?,
                access_key_id: row.get(6)?,
                path_style: path_style != 0,
                default_bucket: row.get(8)?,
                created_at: row.get(9)?,
            })
        })
        .map_err(|err| format!("query list s3 failed: {err}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("parse list s3 row failed: {err}"))
}

pub fn get_s3_connection(
    app_handle: &tauri::AppHandle,
    id: &str,
) -> Result<Option<S3ConnectionInfo>, String> {
    let conn = open_db(app_handle)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT
              id, name, group_name, provider, endpoint, region, access_key_id,
              path_style, default_bucket, created_at
            FROM s3_connections
            WHERE id = ?1
            "#,
        )
        .map_err(|err| format!("prepare get s3 query failed: {err}"))?;

    stmt.query_row(params![id], |row| {
        let path_style: i64 = row.get(7)?;
        Ok(S3ConnectionInfo {
            id: row.get(0)?,
            name: row.get(1)?,
            group_name: row.get(2)?,
            provider: row.get(3)?,
            endpoint: row.get(4)?,
            region: row.get(5)?,
            access_key_id: row.get(6)?,
            path_style: path_style != 0,
            default_bucket: row.get(8)?,
            created_at: row.get(9)?,
        })
    })
    .optional()
    .map_err(|err| format!("get s3 connection failed: {err}"))
}

pub fn save_s3_connection(app_handle: &tauri::AppHandle, form: S3ConnectionForm) -> Result<String, String> {
    let conn = open_db(app_handle)?;
    let id = form.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let created_at = chrono::Utc::now().to_rfc3339();

    let current_secret = get_s3_secret_access_key(app_handle, &id)?;
    let raw_secret = form.secret_access_key.unwrap_or_default();
    let secret = if raw_secret.is_empty() {
        current_secret.unwrap_or_default()
    } else {
        raw_secret
    };
    if secret.trim().is_empty() {
        return Err("secretAccessKey is required".to_string());
    }
    let secret_access_key_encrypted = crate::crypto::encrypt(app_handle, &secret)?;

    conn.execute(
        r#"
        INSERT INTO s3_connections (
          id, name, group_name, provider, endpoint, region, access_key_id,
          secret_access_key_encrypted, path_style, default_bucket, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          group_name = excluded.group_name,
          provider = excluded.provider,
          endpoint = excluded.endpoint,
          region = excluded.region,
          access_key_id = excluded.access_key_id,
          secret_access_key_encrypted = excluded.secret_access_key_encrypted,
          path_style = excluded.path_style,
          default_bucket = excluded.default_bucket
        "#,
        params![
            id,
            form.name.trim(),
            form.group_name.map(|v| v.trim().to_string()),
            form.provider.trim(),
            form.endpoint.map(|v| v.trim().to_string()),
            form.region.trim(),
            form.access_key_id.trim(),
            secret_access_key_encrypted,
            if form.path_style.unwrap_or(false) { 1 } else { 0 },
            form.default_bucket.map(|v| v.trim().to_string()),
            created_at
        ],
    )
    .map_err(|err| format!("save s3 connection failed: {err}"))?;

    Ok(id)
}

pub fn delete_s3_connection(app_handle: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let conn = open_db(app_handle)?;
    conn.execute("DELETE FROM s3_connections WHERE id = ?1", params![id])
        .map_err(|err| format!("delete s3 connection failed: {err}"))?;
    Ok(())
}

pub fn get_s3_secret_access_key(
    app_handle: &tauri::AppHandle,
    id: &str,
) -> Result<Option<String>, String> {
    let conn = open_db(app_handle)?;
    let encrypted = conn
        .query_row(
            "SELECT secret_access_key_encrypted FROM s3_connections WHERE id = ?1",
            params![id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|err| format!("query s3 secret failed: {err}"))?;

    encrypted
        .map(|value| crate::crypto::decrypt(app_handle, &value))
        .transpose()
}
