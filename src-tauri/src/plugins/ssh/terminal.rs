use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
#[cfg(windows)]
use std::os::windows::process::CommandExt;

use base64::Engine;
use tauri::Emitter;

use super::types::SshTerminalSessionInfo;

struct TerminalSession {
    pub session_id: String,
    pub conn_id: String,
    pub app_handle: tauri::AppHandle,
    pub stdin: Arc<Mutex<ChildStdin>>,
    pub child: Arc<Mutex<Child>>,
    pub runtime_key_path: Option<PathBuf>,
    pub pending_output: Arc<Mutex<Vec<u8>>>,
}

fn pool() -> &'static Arc<Mutex<HashMap<String, TerminalSession>>> {
    static POOL: OnceLock<Arc<Mutex<HashMap<String, TerminalSession>>>> = OnceLock::new();
    POOL.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

fn event_output(session_id: &str) -> String {
    format!("ssh://terminal-output/{session_id}")
}

fn event_exit(session_id: &str) -> String {
    format!("ssh://terminal-exit/{session_id}")
}

fn emit_output(app_handle: &tauri::AppHandle, session_id: &str, data: &[u8]) {
    let output = base64::engine::general_purpose::STANDARD.encode(data);
    let _ = app_handle.emit(&event_output(session_id), output);
}

fn prepare_runtime_key_file(app_handle: &tauri::AppHandle, source_key_path: &str) -> Result<PathBuf, String> {
    let source = Path::new(source_key_path);
    if !source.exists() {
        return Err(format!("ssh key file not found: {source_key_path}"));
    }
    let key_content =
        std::fs::read_to_string(source).map_err(|err| format!("read ssh key failed: {err}"))?;
    let runtime_dir = crate::db::init::data_dir(app_handle)?
        .join("ssh")
        .join("runtime-keys");
    std::fs::create_dir_all(&runtime_dir)
        .map_err(|err| format!("create runtime key dir failed: {err}"))?;
    let runtime_file = runtime_dir.join(format!("{}.pem", uuid::Uuid::new_v4()));
    std::fs::write(&runtime_file, key_content)
        .map_err(|err| format!("write runtime key file failed: {err}"))?;
    harden_runtime_key_permissions(&runtime_file)?;
    Ok(runtime_file)
}

fn harden_runtime_key_permissions(path: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        let path_str = path.to_string_lossy().to_string();
        let output0 = Command::new("icacls")
            .args([path_str.as_str(), "/reset"])
            .output()
            .map_err(|err| format!("run icacls reset failed: {err}"))?;
        if !output0.status.success() {
            return Err(format!(
                "reset key acl failed: {}",
                String::from_utf8_lossy(&output0.stderr)
            ));
        }
        let output1 = Command::new("icacls")
            .args([path_str.as_str(), "/inheritance:r"])
            .output()
            .map_err(|err| format!("run icacls inheritance failed: {err}"))?;
        if !output1.status.success() {
            return Err(format!(
                "set key inheritance failed: {}",
                String::from_utf8_lossy(&output1.stderr)
            ));
        }
        let whoami = Command::new("whoami")
            .output()
            .map_err(|err| format!("run whoami failed: {err}"))?;
        if !whoami.status.success() {
            return Err(format!(
                "resolve current user failed: {}",
                String::from_utf8_lossy(&whoami.stderr)
            ));
        }
        let username = String::from_utf8_lossy(&whoami.stdout).trim().to_string();
        if username.is_empty() {
            return Err("USERNAME not found for key permission hardening".to_string());
        }
        let grant_user = format!("{username}:(R)");
        let output2 = Command::new("icacls")
            .args([path_str.as_str(), "/grant:r", grant_user.as_str()])
            .output()
            .map_err(|err| format!("run icacls grant failed: {err}"))?;
        if !output2.status.success() {
            return Err(format!(
                "grant user permission failed: {}",
                String::from_utf8_lossy(&output2.stderr)
            ));
        }
        let output3 = Command::new("icacls")
            .args([
                path_str.as_str(),
                "/remove",
                "Everyone",
                "Users",
                "Authenticated Users",
                "BUILTIN\\Users",
                "BUILTIN\\Administrators",
                "NT AUTHORITY\\SYSTEM",
            ])
            .output()
            .map_err(|err| format!("run icacls remove failed: {err}"))?;
        if !output3.status.success() {
            // Keep non-fatal; some groups may not exist in localized systems.
        }
    }
    Ok(())
}

fn build_ssh_command(
    app_handle: &tauri::AppHandle,
    conn_id: &str,
) -> Result<(String, Vec<String>, Option<PathBuf>), String> {
    let conn = crate::db::ssh_connection_repo::get_ssh_connection(app_handle, conn_id)?
        .ok_or_else(|| format!("ssh connection `{conn_id}` not found"))?;
    let (password, _passphrase) = crate::db::ssh_connection_repo::get_ssh_auth_secret(app_handle, conn_id)?;
    let mut runtime_key_path: Option<PathBuf> = None;

    let mut args = vec![
        "-tt".to_string(),
        "-o".to_string(),
        "LogLevel=ERROR".to_string(),
        "-o".to_string(),
        "StrictHostKeyChecking=accept-new".to_string(),
        "-o".to_string(),
        "UserKnownHostsFile=NUL".to_string(),
        "-o".to_string(),
        "ServerAliveInterval=30".to_string(),
        "-p".to_string(),
        conn.port.to_string(),
    ];

    if conn.auth_type == "key" || conn.auth_type == "key_password" {
        if let Some(key_id) = conn.key_id.clone() {
            if let Some(key_path) = crate::db::ssh_connection_repo::get_ssh_key_path(app_handle, &key_id)? {
                let runtime_key = prepare_runtime_key_file(app_handle, &key_path)?;
                args.push("-i".to_string());
                args.push(runtime_key.to_string_lossy().to_string());
                runtime_key_path = Some(runtime_key);
            } else {
                return Err("selected key not found".to_string());
            }
        } else {
            return Err("key auth selected but keyId is empty".to_string());
        }
    }

    if let Some(jump_host_id) = conn.jump_host_id.clone() {
        if let Some(jump) = crate::db::ssh_connection_repo::get_ssh_connection(app_handle, &jump_host_id)? {
            args.push("-J".to_string());
            args.push(format!("{}@{}:{}", jump.username, jump.host, jump.port));
        }
    }

    args.push(format!("{}@{}", conn.username, conn.host));

    if conn.auth_type == "password" && password.unwrap_or_default().is_empty() {
        return Err("password auth selected but password is empty".to_string());
    }

    Ok(("ssh".to_string(), args, runtime_key_path))
}

pub fn open_terminal(
    app_handle: &tauri::AppHandle,
    conn_id: &str,
) -> Result<SshTerminalSessionInfo, String> {
    let _ = super::session_pool::get_session(conn_id)?;
    let session_id = uuid::Uuid::new_v4().to_string();
    let (program, args, runtime_key_path) = build_ssh_command(app_handle, conn_id)?;

    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command
        .spawn()
        .map_err(|err| format!("failed to launch ssh process: {err}"))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "failed to capture ssh stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to capture ssh stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "failed to capture ssh stderr".to_string())?;

    let session = TerminalSession {
        session_id: session_id.clone(),
        conn_id: conn_id.to_string(),
        app_handle: app_handle.clone(),
        stdin: Arc::new(Mutex::new(stdin)),
        child: Arc::new(Mutex::new(child)),
        runtime_key_path,
        pending_output: Arc::new(Mutex::new(Vec::new())),
    };

    {
        let mut guard = pool()
            .lock()
            .map_err(|_| "failed to acquire terminal pool lock".to_string())?;
        guard.insert(session_id.clone(), session);
    }

    let session_ref_out = {
        let guard = pool()
            .lock()
            .map_err(|_| "failed to acquire terminal pool lock".to_string())?;
        guard
            .get(&session_id)
            .map(|s| (s.app_handle.clone(), s.session_id.clone(), s.pending_output.clone()))
            .ok_or_else(|| "terminal session not found after spawn".to_string())?
    };
    tauri::async_runtime::spawn_blocking(move || {
        let (app_handle, sid, pending) = session_ref_out;
        let mut reader = stdout;
        let mut buffer = [0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => {
                    if let Ok(mut p) = pending.lock() {
                        p.extend_from_slice(&buffer[..n]);
                    }
                    emit_output(&app_handle, &sid, &buffer[..n]);
                }
                Err(_) => break,
            }
        }
    });

    let session_ref_err = {
        let guard = pool()
            .lock()
            .map_err(|_| "failed to acquire terminal pool lock".to_string())?;
        guard
            .get(&session_id)
            .map(|s| (s.app_handle.clone(), s.session_id.clone(), s.pending_output.clone()))
            .ok_or_else(|| "terminal session not found after spawn".to_string())?
    };
    tauri::async_runtime::spawn_blocking(move || {
        let (app_handle, sid, pending) = session_ref_err;
        let mut reader = stderr;
        let mut buffer = [0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => {
                    if let Ok(mut p) = pending.lock() {
                        p.extend_from_slice(&buffer[..n]);
                    }
                    emit_output(&app_handle, &sid, &buffer[..n]);
                }
                Err(_) => break,
            }
        }
    });

    let wait_handle = app_handle.clone();
    let wait_session = session_id.clone();
    let child_ref = {
        let guard = pool()
            .lock()
            .map_err(|_| "failed to acquire terminal pool lock".to_string())?;
        guard
            .get(&session_id)
            .map(|item| item.child.clone())
            .ok_or_else(|| "terminal session not found after spawn".to_string())?
    };
    tauri::async_runtime::spawn_blocking(move || {
        let exit_code = {
            let mut child = match child_ref.lock() {
                Ok(v) => v,
                Err(_) => return,
            };
            match child.wait() {
                Ok(status) => status.code().unwrap_or(0),
                Err(_) => 1,
            }
        };
        let _ = wait_handle.emit(&event_exit(&wait_session), exit_code);
        if let Ok(mut guard) = pool().lock() {
            if let Some(session) = guard.remove(&wait_session) {
                if let Some(path) = session.runtime_key_path {
                    let _ = std::fs::remove_file(path);
                }
            }
        }
    });

    Ok(SshTerminalSessionInfo {
        session_id,
        conn_id: conn_id.to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

pub fn drain_output(session_id: &str) -> Result<String, String> {
    let pending_ref = {
        let guard = pool()
            .lock()
            .map_err(|_| "failed to acquire terminal pool lock".to_string())?;
        guard
            .get(session_id)
            .map(|item| item.pending_output.clone())
            .ok_or_else(|| format!("terminal session `{session_id}` not found"))?
    };
    let mut pending = pending_ref
        .lock()
        .map_err(|_| "failed to lock pending output".to_string())?;
    let payload = base64::engine::general_purpose::STANDARD.encode(&*pending);
    pending.clear();
    Ok(payload)
}

pub fn terminal_input(session_id: &str, data: &[u8]) -> Result<(), String> {
    let stdin_ref = {
        let guard = pool()
            .lock()
            .map_err(|_| "failed to acquire terminal pool lock".to_string())?;
        guard
            .get(session_id)
            .map(|item| item.stdin.clone())
            .ok_or_else(|| format!("terminal session `{session_id}` not found"))?
    };
    let mut stdin = stdin_ref
        .lock()
        .map_err(|_| "failed to lock terminal stdin".to_string())?;
    stdin
        .write_all(data)
        .map_err(|err| format!("write terminal input failed: {err}"))?;
    stdin
        .flush()
        .map_err(|err| format!("flush terminal input failed: {err}"))?;
    Ok(())
}

pub fn terminal_resize(session_id: &str, _cols: u16, _rows: u16) -> Result<(), String> {
    let guard = pool()
        .lock()
        .map_err(|_| "failed to acquire terminal pool lock".to_string())?;
    if guard.contains_key(session_id) {
        return Ok(());
    }
    Err(format!("terminal session `{session_id}` not found"))
}

pub fn close_terminal(session_id: &str, exit_code: i32) -> Result<(), String> {
    let removed = {
        let mut guard = pool()
            .lock()
            .map_err(|_| "failed to acquire terminal pool lock".to_string())?;
        guard.remove(session_id)
    };
    if let Some(session) = removed {
        if let Ok(mut child) = session.child.lock() {
            let _ = child.kill();
        }
        if let Some(path) = session.runtime_key_path {
            let _ = std::fs::remove_file(path);
        }
        session
            .app_handle
            .emit(&event_exit(session_id), exit_code)
            .map_err(|err| format!("emit terminal exit failed: {err}"))?;
        return Ok(());
    }
    Err(format!("terminal session `{session_id}` not found"))
}

pub fn close_by_conn(conn_id: &str) -> Result<(), String> {
    let ids = {
        let guard = pool()
            .lock()
            .map_err(|_| "failed to acquire terminal pool lock".to_string())?;
        guard
            .values()
            .filter(|item| item.conn_id == conn_id)
            .map(|item| item.session_id.clone())
            .collect::<Vec<_>>()
    };
    for session_id in ids {
        let _ = close_terminal(&session_id, 130);
    }
    Ok(())
}
