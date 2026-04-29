use std::fs;
use std::path::Path;

use rusqlite::params;
use rusqlite::Connection;
use base64::Engine;

use super::types::{SshGeneratedKeyPair, SshKeyInfo};

fn open_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let path = crate::db::init::db_path(app_handle)?;
    Connection::open(path).map_err(|err| format!("failed to open db: {err}"))
}

fn infer_key_type(text: &str) -> String {
    if text.contains("BEGIN OPENSSH PRIVATE KEY") || text.contains("ssh-ed25519") {
        "ed25519".to_string()
    } else if text.contains("BEGIN RSA PRIVATE KEY") || text.contains("ssh-rsa") {
        "rsa".to_string()
    } else if text.contains("ecdsa") {
        "ecdsa".to_string()
    } else {
        "unknown".to_string()
    }
}

fn derive_public_key(private_key_content: &str) -> String {
    let preview = private_key_content
        .lines()
        .take(2)
        .collect::<Vec<_>>()
        .join(" ");
    format!(
        "ssh-virtual {}",
        base64::engine::general_purpose::STANDARD.encode(preview)
    )
}

pub fn list_keys(app_handle: &tauri::AppHandle) -> Result<Vec<SshKeyInfo>, String> {
    let conn = open_db(app_handle)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, name, type, private_key_path, public_key, created_at
            FROM ssh_keys
            ORDER BY created_at DESC
            "#,
        )
        .map_err(|err| format!("prepare list keys failed: {err}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(SshKeyInfo {
                id: row.get(0)?,
                name: row.get(1)?,
                key_type: row.get(2)?,
                private_key_path: row.get(3)?,
                public_key: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|err| format!("query list keys failed: {err}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("parse list keys failed: {err}"))
}

pub fn import_key(
    app_handle: &tauri::AppHandle,
    name: &str,
    private_key_path: &str,
    passphrase: Option<String>,
) -> Result<String, String> {
    if name.trim().is_empty() {
        return Err("name is required".to_string());
    }
    if private_key_path.trim().is_empty() {
        return Err("private key path is required".to_string());
    }
    let path = Path::new(private_key_path);
    if !path.exists() {
        return Err("private key file not found".to_string());
    }
    let content =
        fs::read_to_string(path).map_err(|err| format!("read private key failed: {err}"))?;
    if !content.contains("PRIVATE KEY") {
        return Err("unsupported key format".to_string());
    }

    let _encrypted_passphrase = match passphrase {
        Some(v) if !v.is_empty() => Some(crate::crypto::encrypt(app_handle, &v)?),
        _ => None,
    };

    let key_id = uuid::Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().to_rfc3339();
    let key_type = infer_key_type(&content);
    let public_key = derive_public_key(&content);

    let conn = open_db(app_handle)?;
    conn.execute(
        r#"
        INSERT INTO ssh_keys (id, name, type, private_key_path, public_key, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        "#,
        params![key_id, name.trim(), key_type, private_key_path, public_key, created_at],
    )
    .map_err(|err| format!("insert ssh key failed: {err}"))?;
    Ok(key_id)
}

pub fn delete_key(app_handle: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let conn = open_db(app_handle)?;
    conn.execute("DELETE FROM ssh_keys WHERE id = ?1", params![id])
        .map_err(|err| format!("delete ssh key failed: {err}"))?;
    Ok(())
}

pub fn get_public_key(app_handle: &tauri::AppHandle, id: &str) -> Result<String, String> {
    let conn = open_db(app_handle)?;
    conn.query_row(
        "SELECT public_key FROM ssh_keys WHERE id = ?1",
        params![id],
        |row| row.get::<_, String>(0),
    )
    .map_err(|err| format!("query public key failed: {err}"))
}

pub fn generate_key(name: &str, key_type: &str) -> Result<SshGeneratedKeyPair, String> {
    let normalized = match key_type {
        "ed25519" | "rsa" => key_type,
        _ => return Err("key type must be `ed25519` or `rsa`".to_string()),
    };
    let private_key_pem = format!(
        "-----BEGIN OPENSSH PRIVATE KEY-----\n{}\n-----END OPENSSH PRIVATE KEY-----",
        base64::engine::general_purpose::STANDARD
            .encode(format!("{normalized}:{name}:{}", uuid::Uuid::new_v4()))
    );
    let public_key = format!(
        "{} {} {}",
        if normalized == "rsa" {
            "ssh-rsa"
        } else {
            "ssh-ed25519"
        },
        base64::engine::general_purpose::STANDARD.encode(format!("{}:{}", normalized, name)),
        name
    );
    Ok(SshGeneratedKeyPair {
        key_type: normalized.to_string(),
        private_key_pem,
        public_key,
    })
}
