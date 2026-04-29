use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use crate::db::ssh_connection_repo::SshConnectionInfo;
use tauri::Emitter;
use tauri::async_runtime::JoinHandle;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshSessionHandle {
    pub conn_id: String,
    pub connected: bool,
    pub last_active_ts: i64,
    pub config: SshConnectionInfo,
}

fn pool() -> &'static Arc<Mutex<HashMap<String, SshSessionHandle>>> {
    static POOL: OnceLock<Arc<Mutex<HashMap<String, SshSessionHandle>>>> = OnceLock::new();
    POOL.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

fn tasks() -> &'static Arc<Mutex<HashMap<String, JoinHandle<()>>>> {
    static TASKS: OnceLock<Arc<Mutex<HashMap<String, JoinHandle<()>>>>> = OnceLock::new();
    TASKS.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

fn now_ts() -> i64 {
    chrono::Utc::now().timestamp()
}

fn tcp_probe(host: &str, port: u16) -> bool {
    use std::net::ToSocketAddrs;

    let addrs = match format!("{host}:{port}").to_socket_addrs() {
        Ok(v) => v,
        Err(_) => return false,
    };
    for addr in addrs {
        if std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_secs(2)).is_ok() {
            return true;
        }
    }
    false
}

fn event_session_closed() -> &'static str {
    "ssh://session-closed"
}

fn spawn_keepalive(app_handle: tauri::AppHandle, conn_id: String, config: SshConnectionInfo) -> JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(config.keepalive_interval as u64)).await;

            let active = {
                let guard = match pool().lock() {
                    Ok(v) => v,
                    Err(_) => return,
                };
                guard.get(&conn_id).map(|item| item.connected).unwrap_or(false)
            };
            if !active {
                return;
            }

            if tcp_probe(&config.host, config.port) {
                if let Ok(mut guard) = pool().lock() {
                    if let Some(item) = guard.get_mut(&conn_id) {
                        item.last_active_ts = now_ts();
                    }
                }
                continue;
            }

            let mut reconnected = false;
            for backoff in [2u64, 4, 8] {
                tokio::time::sleep(std::time::Duration::from_secs(backoff)).await;
                if tcp_probe(&config.host, config.port) {
                    reconnected = true;
                    if let Ok(mut guard) = pool().lock() {
                        if let Some(item) = guard.get_mut(&conn_id) {
                            item.connected = true;
                            item.last_active_ts = now_ts();
                        }
                    }
                    break;
                }
            }

            if !reconnected {
                if let Ok(mut guard) = pool().lock() {
                    guard.remove(&conn_id);
                }
                if let Ok(mut term_guard) = tasks().lock() {
                    term_guard.remove(&conn_id);
                }
                let _ = super::terminal::close_by_conn(&conn_id);
                let _ = app_handle.emit(event_session_closed(), conn_id.clone());
                return;
            }
        }
    })
}

pub fn open_session(
    app_handle: &tauri::AppHandle,
    conn_id: &str,
    config: &SshConnectionInfo,
) -> Result<(), String> {
    if !tcp_probe(&config.host, config.port) {
        return Err("ssh tcp handshake failed".to_string());
    }

    let mut guard = pool()
        .lock()
        .map_err(|_| "failed to acquire ssh session pool lock".to_string())?;
    guard.insert(
        conn_id.to_string(),
        SshSessionHandle {
            conn_id: conn_id.to_string(),
            connected: true,
            last_active_ts: now_ts(),
            config: config.clone(),
        },
    );
    drop(guard);

    if let Ok(mut handle_guard) = tasks().lock() {
        if let Some(old) = handle_guard.remove(conn_id) {
            old.abort();
        }
        handle_guard.insert(
            conn_id.to_string(),
            spawn_keepalive(app_handle.clone(), conn_id.to_string(), config.clone()),
        );
    }

    Ok(())
}

pub fn close_session(app_handle: &tauri::AppHandle, conn_id: &str) -> Result<(), String> {
    let mut guard = pool()
        .lock()
        .map_err(|_| "failed to acquire ssh session pool lock".to_string())?;
    let existed = guard.remove(conn_id).is_some();
    drop(guard);

    if let Ok(mut handle_guard) = tasks().lock() {
        if let Some(handle) = handle_guard.remove(conn_id) {
            handle.abort();
        }
    }
    let _ = super::terminal::close_by_conn(conn_id);
    if existed {
        app_handle
            .emit(event_session_closed(), conn_id.to_string())
            .map_err(|err| format!("emit session-closed failed: {err}"))?;
    }
    Ok(())
}

pub fn get_session(conn_id: &str) -> Result<SshSessionHandle, String> {
    let guard = pool()
        .lock()
        .map_err(|_| "failed to acquire ssh session pool lock".to_string())?;

    guard
        .get(conn_id)
        .cloned()
        .ok_or_else(|| format!("ssh session not found for connection id `{conn_id}`"))
}
