use crate::db::ssh_connection_repo::{self, SshConnectionForm, SshConnectionInfo};
use rusqlite::params;
use rusqlite::Connection;
use base64::Engine;

use super::types::SshLatency;

#[tauri::command]
pub fn cmd_ssh_list_connections(
    app_handle: tauri::AppHandle,
) -> Result<Vec<SshConnectionInfo>, String> {
    ssh_connection_repo::list_ssh_connections(&app_handle)
}

#[tauri::command]
pub fn cmd_ssh_save_connection(
    app_handle: tauri::AppHandle,
    form: SshConnectionForm,
) -> Result<String, String> {
    ssh_connection_repo::save_ssh_connection(&app_handle, form)
}

#[tauri::command]
pub fn cmd_ssh_delete_connection(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    super::session_pool::close_session(&app_handle, &id)?;
    ssh_connection_repo::delete_ssh_connection(&app_handle, &id)
}

#[tauri::command]
pub fn cmd_ssh_test_connection(form: SshConnectionForm) -> Result<SshLatency, String> {
    if form.host.trim().is_empty() {
        return Err("host is required".to_string());
    }
    if form.username.trim().is_empty() {
        return Err("username is required".to_string());
    }
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(5);
    let addrs = {
        use std::net::ToSocketAddrs;
        format!("{}:{}", form.host, form.port)
            .to_socket_addrs()
            .map_err(|err| format!("resolve host failed: {err}"))?
            .collect::<Vec<_>>()
    };
    if addrs.is_empty() {
        return Err("resolve host failed: no address found".to_string());
    }
    let mut connected = false;
    for addr in addrs {
        if std::net::TcpStream::connect_timeout(&addr, timeout).is_ok() {
            connected = true;
            break;
        }
    }
    if !connected {
        return Err("ssh tcp handshake failed".to_string());
    }
    Ok(SshLatency {
        millis: start.elapsed().as_millis() as u64,
    })
}

#[tauri::command]
pub fn cmd_ssh_connect(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = ssh_connection_repo::get_ssh_connection(&app_handle, &id)?
        .ok_or_else(|| format!("ssh connection `{id}` not found"))?;
    let _ = ssh_connection_repo::get_ssh_auth_secret(&app_handle, &id)?;
    super::session_pool::open_session(&app_handle, &id, &conn)
}

#[tauri::command]
pub fn cmd_ssh_disconnect(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    super::session_pool::close_session(&app_handle, &id)
}

#[tauri::command]
pub fn cmd_ssh_open_terminal(
    app_handle: tauri::AppHandle,
    conn_id: String,
) -> Result<super::types::SshTerminalSessionInfo, String> {
    super::terminal::open_terminal(&app_handle, &conn_id)
}

#[tauri::command]
pub fn cmd_ssh_terminal_input(session_id: String, data_base64: String) -> Result<(), String> {
    let data = base64::engine::general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|err| format!("invalid base64 input: {err}"))?;
    super::terminal::terminal_input(&session_id, &data)
}

#[tauri::command]
pub fn cmd_ssh_terminal_resize(session_id: String, cols: u16, rows: u16) -> Result<(), String> {
    super::terminal::terminal_resize(&session_id, cols, rows)
}

#[tauri::command]
pub fn cmd_ssh_close_terminal(session_id: String) -> Result<(), String> {
    super::terminal::close_terminal(&session_id, 0)
}

#[tauri::command]
pub fn cmd_ssh_terminal_drain_output(session_id: String) -> Result<String, String> {
    super::terminal::drain_output(&session_id)
}

#[tauri::command]
pub fn cmd_ssh_list_keys(app_handle: tauri::AppHandle) -> Result<Vec<super::types::SshKeyInfo>, String> {
    super::key_store::list_keys(&app_handle)
}

#[tauri::command]
pub fn cmd_ssh_import_key(
    app_handle: tauri::AppHandle,
    name: String,
    private_key_path: String,
    passphrase: Option<String>,
) -> Result<String, String> {
    super::key_store::import_key(&app_handle, &name, &private_key_path, passphrase)
}

#[tauri::command]
pub fn cmd_ssh_delete_key(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    super::key_store::delete_key(&app_handle, &id)
}

#[tauri::command]
pub fn cmd_ssh_generate_key(
    name: String,
    key_type: String,
) -> Result<super::types::SshGeneratedKeyPair, String> {
    super::key_store::generate_key(&name, &key_type)
}

#[tauri::command]
pub fn cmd_ssh_get_public_key(app_handle: tauri::AppHandle, id: String) -> Result<String, String> {
    super::key_store::get_public_key(&app_handle, &id)
}

fn open_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let path = crate::db::init::db_path(app_handle)?;
    Connection::open(path).map_err(|err| format!("failed to open db: {err}"))
}

#[tauri::command]
pub fn cmd_ssh_list_quick_commands(
    app_handle: tauri::AppHandle,
    connection_id: Option<String>,
) -> Result<Vec<super::types::SshQuickCommand>, String> {
    let conn = open_db(&app_handle)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, connection_id, name, command, sort_order
            FROM ssh_quick_commands
            WHERE connection_id IS NULL OR connection_id = ?1
            ORDER BY sort_order ASC, name ASC
            "#,
        )
        .map_err(|err| format!("prepare quick command query failed: {err}"))?;
    let rows = stmt
        .query_map(params![connection_id], |row| {
            Ok(super::types::SshQuickCommand {
                id: row.get(0)?,
                connection_id: row.get(1)?,
                name: row.get(2)?,
                command: row.get(3)?,
                sort_order: row.get(4)?,
            })
        })
        .map_err(|err| format!("query quick commands failed: {err}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("parse quick commands failed: {err}"))
}

#[tauri::command]
pub fn cmd_ssh_save_quick_command(
    app_handle: tauri::AppHandle,
    form: super::types::SshQuickCommandForm,
) -> Result<String, String> {
    if form.name.trim().is_empty() || form.command.trim().is_empty() {
        return Err("name and command are required".to_string());
    }
    let id = form.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let conn = open_db(&app_handle)?;
    conn.execute(
        r#"
        INSERT INTO ssh_quick_commands (id, connection_id, name, command, sort_order)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(id) DO UPDATE SET
          connection_id = excluded.connection_id,
          name = excluded.name,
          command = excluded.command,
          sort_order = excluded.sort_order
        "#,
        params![
            id,
            form.connection_id,
            form.name.trim(),
            form.command,
            form.sort_order.unwrap_or(0)
        ],
    )
    .map_err(|err| format!("save quick command failed: {err}"))?;
    Ok(id)
}

#[tauri::command]
pub fn cmd_ssh_delete_quick_command(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app_handle)?;
    conn.execute("DELETE FROM ssh_quick_commands WHERE id = ?1", params![id])
        .map_err(|err| format!("delete quick command failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub fn cmd_tunnel_list_rules(
    app_handle: tauri::AppHandle,
    conn_id: String,
) -> Result<Vec<super::types::TunnelRule>, String> {
    super::tunnel::list_rules(&app_handle, &conn_id)
}

#[tauri::command]
pub fn cmd_tunnel_save_rule(
    app_handle: tauri::AppHandle,
    form: super::types::TunnelRuleForm,
) -> Result<String, String> {
    super::tunnel::save_rule(&app_handle, form)
}

#[tauri::command]
pub fn cmd_tunnel_delete_rule(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    super::tunnel::delete_rule(&app_handle, &id)
}

#[tauri::command]
pub fn cmd_tunnel_start_local(
    app_handle: tauri::AppHandle,
    form: super::types::TunnelStartForm,
) -> Result<(), String> {
    super::tunnel::start_local(&app_handle, form)
}

#[tauri::command]
pub fn cmd_tunnel_start_remote(
    app_handle: tauri::AppHandle,
    form: super::types::TunnelStartForm,
) -> Result<(), String> {
    super::tunnel::start_remote(&app_handle, form)
}

#[tauri::command]
pub fn cmd_tunnel_start_dynamic(
    app_handle: tauri::AppHandle,
    form: super::types::TunnelStartForm,
) -> Result<(), String> {
    super::tunnel::start_dynamic(&app_handle, form)
}

#[tauri::command]
pub fn cmd_tunnel_stop(app_handle: tauri::AppHandle, rule_id: String) -> Result<(), String> {
    super::tunnel::stop(&app_handle, &rule_id)
}
