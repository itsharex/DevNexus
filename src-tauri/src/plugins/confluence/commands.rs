use base64::Engine;
use rusqlite::{params, Connection};
use std::time::Instant;

use super::client::ConfluenceClient;
use super::types::*;

fn open_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let path = crate::db::init::db_path(app_handle)?;
    Connection::open(path).map_err(|err| format!("failed to open db: {err}"))
}

#[tauri::command]
pub async fn cmd_confluence_list_connections(
    app_handle: tauri::AppHandle,
) -> Result<Vec<ConfluenceConnectionInfo>, String> {
    let conn = open_db(&app_handle)?;
    let mut stmt = conn
        .prepare("SELECT id, label, base_url, username, created_at, updated_at FROM confluence_connections ORDER BY created_at DESC")
        .map_err(|e| format!("prepare failed: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ConfluenceConnectionInfo {
                id: row.get(0)?,
                label: row.get(1)?,
                base_url: row.get(2)?,
                username: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| format!("query failed: {e}"))?;
    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| format!("row read failed: {e}"))?);
    }
    Ok(results)
}

#[tauri::command]
pub async fn cmd_confluence_save_connection(
    app_handle: tauri::AppHandle,
    form: ConfluenceConnectionForm,
) -> Result<String, String> {
    let conn = open_db(&app_handle)?;
    let password_encrypted = crate::crypto::encrypt(&app_handle, &form.password)?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = form.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    conn.execute(
        r#"INSERT INTO confluence_connections (id, label, base_url, username, password_encrypted, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT(id) DO UPDATE SET label=?2, base_url=?3, username=?4, password_encrypted=?5, updated_at=?7"#,
        params![id, form.label, form.base_url, form.username, password_encrypted, now, now],
    )
    .map_err(|e| format!("save connection failed: {e}"))?;
    Ok(id)
}

#[tauri::command]
pub async fn cmd_confluence_delete_connection(
    app_handle: tauri::AppHandle,
    id: String,
) -> Result<(), String> {
    let conn = open_db(&app_handle)?;
    conn.execute("DELETE FROM confluence_connections WHERE id = ?1", params![id])
        .map_err(|e| format!("delete connection failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_confluence_test_connection(
    _app_handle: tauri::AppHandle,
    form: ConfluenceConnectionForm,
) -> Result<ConfluenceTestResult, String> {
    let started = Instant::now();
    let client = ConfluenceClient::new(&form.base_url, &form.username, &form.password);
    match client.test_connection().await {
        Ok(()) => Ok(ConfluenceTestResult {
            success: true,
            duration_ms: started.elapsed().as_millis() as u64,
            error: None,
        }),
        Err(e) => Ok(ConfluenceTestResult {
            success: false,
            duration_ms: started.elapsed().as_millis() as u64,
            error: Some(e),
        }),
    }
}

fn get_credentials(app_handle: &tauri::AppHandle, conn_id: &str) -> Result<(String, String, String), String> {
    let conn = open_db(app_handle)?;
    let mut stmt = conn
        .prepare("SELECT base_url, username, password_encrypted FROM confluence_connections WHERE id = ?1")
        .map_err(|e| format!("prepare failed: {e}"))?;
    let (base_url, username, password_encrypted): (String, String, String) = stmt
        .query_row(params![conn_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|e| format!("connection not found: {e}"))?;
    let password = crate::crypto::decrypt(app_handle, &password_encrypted)?;
    Ok((base_url, username, password))
}

#[tauri::command]
pub async fn cmd_confluence_list_spaces(
    app_handle: tauri::AppHandle,
    conn_id: String,
) -> Result<Vec<SpaceInfo>, String> {
    let (base_url, username, password) = get_credentials(&app_handle, &conn_id)?;
    let client = ConfluenceClient::new(&base_url, &username, &password);
    client.list_spaces().await
}

#[tauri::command]
pub async fn cmd_confluence_list_pages(
    app_handle: tauri::AppHandle,
    conn_id: String,
    space_key: String,
    parent_id: Option<String>,
) -> Result<Vec<PageInfo>, String> {
    let (base_url, username, password) = get_credentials(&app_handle, &conn_id)?;
    let client = ConfluenceClient::new(&base_url, &username, &password);
    client.list_pages(&space_key, parent_id.as_deref()).await
}

#[tauri::command]
pub async fn cmd_confluence_create_page(
    app_handle: tauri::AppHandle,
    conn_id: String,
    space_key: String,
    title: String,
    content_xml: String,
    parent_id: Option<String>,
) -> Result<PageInfo, String> {
    let (base_url, username, password) = get_credentials(&app_handle, &conn_id)?;
    let client = ConfluenceClient::new(&base_url, &username, &password);
    client.create_page(&space_key, &title, &content_xml, parent_id.as_deref()).await
}

#[tauri::command]
pub async fn cmd_confluence_update_page(
    app_handle: tauri::AppHandle,
    conn_id: String,
    page_id: String,
    title: String,
    content_xml: String,
    version: u32,
) -> Result<PageInfo, String> {
    let (base_url, username, password) = get_credentials(&app_handle, &conn_id)?;
    let client = ConfluenceClient::new(&base_url, &username, &password);
    client.update_page(&page_id, &title, &content_xml, version).await
}

#[tauri::command]
pub async fn cmd_confluence_upload_attachment(
    app_handle: tauri::AppHandle,
    conn_id: String,
    page_id: String,
    file_name: String,
    file_base64: String,
    content_type: String,
) -> Result<AttachmentInfo, String> {
    let (base_url, username, password) = get_credentials(&app_handle, &conn_id)?;
    let file_bytes = base64::engine::general_purpose::STANDARD
        .decode(&file_base64)
        .map_err(|e| format!("base64 decode failed: {e}"))?;
    let client = ConfluenceClient::new(&base_url, &username, &password);
    client.upload_attachment(&page_id, &file_name, file_bytes, &content_type).await
}
