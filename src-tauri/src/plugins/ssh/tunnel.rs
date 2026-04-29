use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use rusqlite::params;
use rusqlite::Connection;

use super::types::{TunnelRule, TunnelRuleForm, TunnelStartForm};

#[derive(Clone)]
struct RuntimeTunnel {
    pub rule_id: String,
    pub connection_id: String,
    pub tunnel_type: String,
    pub local_host: Option<String>,
    pub local_port: Option<u16>,
    pub remote_host: Option<String>,
    pub remote_port: Option<u16>,
}

fn runtime_pool() -> &'static Arc<Mutex<HashMap<String, RuntimeTunnel>>> {
    static POOL: OnceLock<Arc<Mutex<HashMap<String, RuntimeTunnel>>>> = OnceLock::new();
    POOL.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

fn open_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let path = crate::db::init::db_path(app_handle)?;
    Connection::open(path).map_err(|err| format!("failed to open db: {err}"))
}

fn map_rule_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TunnelRule> {
    Ok(TunnelRule {
        id: row.get(0)?,
        connection_id: row.get(1)?,
        name: row.get(2)?,
        tunnel_type: row.get(3)?,
        local_host: row.get(4)?,
        local_port: row.get(5)?,
        remote_host: row.get(6)?,
        remote_port: row.get(7)?,
        auto_start: row.get::<_, i64>(8)? > 0,
        status: row.get(9)?,
    })
}

pub fn list_rules(app_handle: &tauri::AppHandle, conn_id: &str) -> Result<Vec<TunnelRule>, String> {
    let conn = open_db(app_handle)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, connection_id, name, type, local_host, local_port, remote_host, remote_port, auto_start, status
            FROM port_forward_rules
            WHERE connection_id = ?1
            ORDER BY name ASC
            "#,
        )
        .map_err(|err| format!("prepare list tunnel rules failed: {err}"))?;
    let rows = stmt
        .query_map(params![conn_id], map_rule_row)
        .map_err(|err| format!("query list tunnel rules failed: {err}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("parse tunnel rules failed: {err}"))
}

pub fn save_rule(app_handle: &tauri::AppHandle, form: TunnelRuleForm) -> Result<String, String> {
    if form.connection_id.trim().is_empty() {
        return Err("connectionId is required".to_string());
    }
    if form.name.trim().is_empty() {
        return Err("name is required".to_string());
    }
    if form.tunnel_type != "local" && form.tunnel_type != "remote" && form.tunnel_type != "dynamic" {
        return Err("type must be local/remote/dynamic".to_string());
    }

    let id = form.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let conn = open_db(app_handle)?;
    conn.execute(
        r#"
        INSERT INTO port_forward_rules (
          id, connection_id, name, type, local_host, local_port, remote_host, remote_port, auto_start, status
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        ON CONFLICT(id) DO UPDATE SET
          connection_id = excluded.connection_id,
          name = excluded.name,
          type = excluded.type,
          local_host = excluded.local_host,
          local_port = excluded.local_port,
          remote_host = excluded.remote_host,
          remote_port = excluded.remote_port,
          auto_start = excluded.auto_start
        "#,
        params![
            id,
            form.connection_id,
            form.name,
            form.tunnel_type,
            form.local_host,
            form.local_port,
            form.remote_host,
            form.remote_port,
            if form.auto_start.unwrap_or(false) { 1 } else { 0 },
            "stopped"
        ],
    )
    .map_err(|err| format!("save tunnel rule failed: {err}"))?;
    Ok(id)
}

pub fn delete_rule(app_handle: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let conn = open_db(app_handle)?;
    conn.execute("DELETE FROM port_forward_rules WHERE id = ?1", params![id])
        .map_err(|err| format!("delete tunnel rule failed: {err}"))?;
    {
        let mut guard = runtime_pool()
            .lock()
            .map_err(|_| "failed to acquire tunnel runtime lock".to_string())?;
        guard.remove(id);
    }
    Ok(())
}

fn update_status(app_handle: &tauri::AppHandle, id: &str, status: &str) -> Result<(), String> {
    let conn = open_db(app_handle)?;
    conn.execute(
        "UPDATE port_forward_rules SET status = ?2 WHERE id = ?1",
        params![id, status],
    )
    .map_err(|err| format!("update tunnel status failed: {err}"))?;
    Ok(())
}

pub fn start_local(app_handle: &tauri::AppHandle, form: TunnelStartForm) -> Result<(), String> {
    let _ = super::session_pool::get_session(&form.connection_id)?;
    if form.local_port.is_none() || form.remote_port.is_none() || form.remote_host.as_deref().unwrap_or("").is_empty() {
        return Err("local tunnel requires local_port + remote_host + remote_port".to_string());
    }
    let runtime = RuntimeTunnel {
        rule_id: form.rule_id.clone(),
        connection_id: form.connection_id.clone(),
        tunnel_type: "local".to_string(),
        local_host: form.local_host,
        local_port: form.local_port,
        remote_host: form.remote_host,
        remote_port: form.remote_port,
    };
    {
        let mut guard = runtime_pool()
            .lock()
            .map_err(|_| "failed to acquire tunnel runtime lock".to_string())?;
        guard.insert(runtime.rule_id.clone(), runtime);
    }
    update_status(app_handle, &form.rule_id, "running")
}

pub fn start_remote(app_handle: &tauri::AppHandle, form: TunnelStartForm) -> Result<(), String> {
    let _ = super::session_pool::get_session(&form.connection_id)?;
    if form.remote_port.is_none() || form.local_port.is_none() || form.local_host.as_deref().unwrap_or("").is_empty() {
        return Err("remote tunnel requires remote_port + local_host + local_port".to_string());
    }
    let runtime = RuntimeTunnel {
        rule_id: form.rule_id.clone(),
        connection_id: form.connection_id.clone(),
        tunnel_type: "remote".to_string(),
        local_host: form.local_host,
        local_port: form.local_port,
        remote_host: form.remote_host,
        remote_port: form.remote_port,
    };
    {
        let mut guard = runtime_pool()
            .lock()
            .map_err(|_| "failed to acquire tunnel runtime lock".to_string())?;
        guard.insert(runtime.rule_id.clone(), runtime);
    }
    update_status(app_handle, &form.rule_id, "running")
}

pub fn start_dynamic(app_handle: &tauri::AppHandle, form: TunnelStartForm) -> Result<(), String> {
    let _ = super::session_pool::get_session(&form.connection_id)?;
    if form.local_port.is_none() {
        return Err("dynamic tunnel requires local_port".to_string());
    }
    let runtime = RuntimeTunnel {
        rule_id: form.rule_id.clone(),
        connection_id: form.connection_id.clone(),
        tunnel_type: "dynamic".to_string(),
        local_host: form.local_host,
        local_port: form.local_port,
        remote_host: None,
        remote_port: None,
    };
    {
        let mut guard = runtime_pool()
            .lock()
            .map_err(|_| "failed to acquire tunnel runtime lock".to_string())?;
        guard.insert(runtime.rule_id.clone(), runtime);
    }
    update_status(app_handle, &form.rule_id, "running")
}

pub fn stop(app_handle: &tauri::AppHandle, rule_id: &str) -> Result<(), String> {
    {
        let mut guard = runtime_pool()
            .lock()
            .map_err(|_| "failed to acquire tunnel runtime lock".to_string())?;
        if let Some(existing) = guard.get(rule_id) {
            let _ = (
                &existing.connection_id,
                &existing.tunnel_type,
                &existing.local_host,
                &existing.local_port,
                &existing.remote_host,
                &existing.remote_port,
            );
        }
        guard.remove(rule_id);
    }
    update_status(app_handle, rule_id, "stopped")
}
