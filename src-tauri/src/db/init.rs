use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

pub fn data_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .app_data_dir()
        .map_err(|err| format!("failed to resolve app data dir: {err}"))
}

fn ensure_directory(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|err| format!("failed to create data dir: {err}"))
}

pub fn db_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = data_dir(app_handle)?;
    Ok(data_dir.join("rdmm.db"))
}

pub fn run(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = data_dir(app_handle)?;
    ensure_directory(&data_dir)?;

    let db_path = db_path(app_handle)?;
    let conn = Connection::open(&db_path).map_err(|err| format!("failed to open db: {err}"))?;

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS connections (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          group_name TEXT,
          host TEXT NOT NULL,
          port INTEGER NOT NULL,
          password_encrypted TEXT,
          db_index INTEGER NOT NULL DEFAULT 0,
          connection_type TEXT NOT NULL DEFAULT 'Standalone',
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS query_history (
          id TEXT PRIMARY KEY NOT NULL,
          connection_id TEXT NOT NULL,
          command TEXT NOT NULL,
          executed_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ssh_keys (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          private_key_path TEXT NOT NULL,
          public_key TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ssh_connections (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          group_name TEXT,
          host TEXT NOT NULL,
          port INTEGER NOT NULL DEFAULT 22,
          username TEXT NOT NULL,
          auth_type TEXT NOT NULL,
          password_encrypted TEXT,
          key_id TEXT,
          key_passphrase_encrypted TEXT,
          jump_host_id TEXT,
          encoding TEXT NOT NULL DEFAULT 'utf-8',
          keepalive_interval INTEGER NOT NULL DEFAULT 30,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ssh_quick_commands (
          id TEXT PRIMARY KEY NOT NULL,
          connection_id TEXT,
          name TEXT NOT NULL,
          command TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS port_forward_rules (
          id TEXT PRIMARY KEY NOT NULL,
          connection_id TEXT NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          local_host TEXT,
          local_port INTEGER,
          remote_host TEXT,
          remote_port INTEGER,
          auto_start INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'stopped'
        );

        CREATE TABLE IF NOT EXISTS s3_connections (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          group_name TEXT,
          provider TEXT NOT NULL,
          endpoint TEXT,
          region TEXT NOT NULL,
          access_key_id TEXT NOT NULL,
          secret_access_key_encrypted TEXT NOT NULL,
          path_style INTEGER NOT NULL DEFAULT 0,
          default_bucket TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS mongodb_connections (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          group_name TEXT,
          mode TEXT NOT NULL DEFAULT 'uri',
          uri_encrypted TEXT,
          host TEXT,
          port INTEGER NOT NULL DEFAULT 27017,
          username TEXT,
          password_encrypted TEXT,
          auth_database TEXT,
          default_database TEXT,
          replica_set TEXT,
          tls INTEGER NOT NULL DEFAULT 0,
          srv INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS mongodb_query_history (
          id TEXT PRIMARY KEY NOT NULL,
          connection_id TEXT NOT NULL,
          database_name TEXT,
          collection_name TEXT,
          query_type TEXT NOT NULL,
          content TEXT NOT NULL,
          executed_at TEXT NOT NULL
        );
        "#,
    )
    .map_err(|err| format!("failed to initialize schema: {err}"))?;

    Ok(db_path)
}
