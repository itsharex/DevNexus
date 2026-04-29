use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use chrono::Utc;
use rusqlite::params;
use serde_json::json;

use crate::db::connection_repo::{self, ConnectionForm, ConnectionInfo};

use super::types::{
    ExportFormat, ExportItem, HashField, ImportResult, KeyMeta, RedisLatency, RedisServerInfo,
    RedisValue, ScanResult, ServerInfo, SlowlogEntry, ZMember,
};

fn get_conn_info(app_handle: &tauri::AppHandle, id: &str) -> Result<ConnectionInfo, String> {
    connection_repo::get_connection(app_handle, id)?
        .ok_or_else(|| format!("connection `{id}` not found"))
}

fn get_sync_conn(app_handle: &tauri::AppHandle, id: &str) -> Result<redis::Connection, String> {
    let info = get_conn_info(app_handle, id)?;
    let password = connection_repo::get_password(app_handle, id)?;
    super::pool::connect(id, &info, password.as_deref())?;
    let client = super::pool::get_client(id)?;
    client
        .get_connection()
        .map_err(|err| format!("failed to get redis connection: {err}"))
}

fn parse_info_sections(raw: &str) -> ServerInfo {
    let mut current = String::new();
    let mut sections: HashMap<String, HashMap<String, String>> = HashMap::new();
    for line in raw.lines() {
        if line.starts_with('#') {
            current = line.trim_start_matches('#').trim().to_lowercase();
            sections.entry(current.clone()).or_default();
            continue;
        }
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = line.split_once(':') {
            sections
                .entry(current.clone())
                .or_default()
                .insert(k.to_string(), v.to_string());
        }
    }
    ServerInfo {
        server: sections.remove("server").unwrap_or_default(),
        clients: sections.remove("clients").unwrap_or_default(),
        memory: sections.remove("memory").unwrap_or_default(),
        stats: sections.remove("stats").unwrap_or_default(),
        replication: sections.remove("replication").unwrap_or_default(),
    }
}

fn redis_to_value(input: redis::Value) -> RedisValue {
    match input {
        redis::Value::Nil => RedisValue::Nil,
        redis::Value::Int(i) => RedisValue::Int(i),
        redis::Value::BulkString(bytes) => {
            RedisValue::Bulk(String::from_utf8_lossy(&bytes).to_string())
        }
        redis::Value::SimpleString(text) => RedisValue::Bulk(text),
        redis::Value::Array(values) => {
            RedisValue::Array(values.into_iter().map(redis_to_value).collect())
        }
        redis::Value::Okay => RedisValue::Bulk("OK".to_string()),
        redis::Value::Map(values) => RedisValue::Array(
            values
                .into_iter()
                .flat_map(|(k, v)| [redis_to_value(k), redis_to_value(v)])
                .collect(),
        ),
        redis::Value::Double(f) => RedisValue::Bulk(f.to_string()),
        redis::Value::Boolean(b) => RedisValue::Bulk(b.to_string()),
        redis::Value::Set(values) => {
            RedisValue::Array(values.into_iter().map(redis_to_value).collect())
        }
        redis::Value::Attribute { data, .. } => redis_to_value(*data),
        redis::Value::VerbatimString { text, .. } => RedisValue::Bulk(text),
        redis::Value::BigNumber(n) => RedisValue::Bulk(n.to_string()),
        redis::Value::Push { data, .. } => {
            RedisValue::Array(data.into_iter().map(redis_to_value).collect())
        }
        redis::Value::ServerError(err) => RedisValue::Error(format!("{err:?}")),
    }
}

fn write_history(
    app_handle: &tauri::AppHandle,
    connection_id: &str,
    command: &str,
) -> Result<(), String> {
    let db_path = crate::db::init::db_path(app_handle)?;
    let conn =
        rusqlite::Connection::open(db_path).map_err(|err| format!("history db open failed: {err}"))?;
    conn.execute(
        "INSERT INTO query_history (id, connection_id, command, executed_at) VALUES (?1, ?2, ?3, ?4)",
        params![
            uuid::Uuid::new_v4().to_string(),
            connection_id,
            command,
            Utc::now().to_rfc3339()
        ],
    )
    .map_err(|err| format!("write query history failed: {err}"))?;
    Ok(())
}

fn list_history(
    app_handle: &tauri::AppHandle,
    connection_id: &str,
    limit: u32,
) -> Result<Vec<String>, String> {
    let db_path = crate::db::init::db_path(app_handle)?;
    let conn =
        rusqlite::Connection::open(db_path).map_err(|err| format!("history db open failed: {err}"))?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT command
            FROM query_history
            WHERE connection_id = ?1
            ORDER BY executed_at DESC
            LIMIT ?2
            "#,
        )
        .map_err(|err| format!("prepare query history failed: {err}"))?;
    let rows = stmt
        .query_map(params![connection_id, limit], |row| row.get::<_, String>(0))
        .map_err(|err| format!("query history failed: {err}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("parse history row failed: {err}"))
}

#[tauri::command]
pub fn cmd_list_connections(app_handle: tauri::AppHandle) -> Result<Vec<ConnectionInfo>, String> {
    connection_repo::list_connections(&app_handle)
}

#[tauri::command]
pub fn cmd_save_connection(
    app_handle: tauri::AppHandle,
    form: ConnectionForm,
) -> Result<String, String> {
    connection_repo::save_connection(&app_handle, form)
}

#[tauri::command]
pub fn cmd_delete_connection(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    super::pool::disconnect(&id)?;
    connection_repo::delete_connection(&app_handle, &id)
}

#[tauri::command]
pub fn cmd_test_connection(form: ConnectionForm) -> Result<RedisLatency, String> {
    let info = ConnectionInfo {
        id: form.id.unwrap_or_default(),
        name: form.name,
        group_name: form.group_name,
        host: form.host,
        port: form.port,
        db_index: form.db_index,
        connection_type: form.connection_type,
        created_at: String::new(),
    };
    let millis = super::pool::test(&info, form.password.as_deref())?;
    Ok(RedisLatency { millis })
}

#[tauri::command]
pub fn cmd_connect(app_handle: tauri::AppHandle, id: String) -> Result<RedisServerInfo, String> {
    let conn = get_conn_info(&app_handle, &id)?;
    let password = connection_repo::get_password(&app_handle, &id)?;
    super::pool::connect(&id, &conn, password.as_deref())?;

    let mut redis_conn = get_sync_conn(&app_handle, &id)?;
    let raw_info = redis::cmd("INFO")
        .arg("server")
        .query::<String>(&mut redis_conn)
        .map_err(|err| format!("query redis INFO failed: {err}"))?;
    let info = parse_info_sections(&raw_info);
    let version = info.server.get("redis_version").cloned().unwrap_or_default();
    let mode = info
        .server
        .get("redis_mode")
        .cloned()
        .unwrap_or_else(|| "standalone".to_string());

    Ok(RedisServerInfo { version, mode })
}

#[tauri::command]
pub fn cmd_disconnect(id: String) -> Result<(), String> {
    super::pool::disconnect(&id)
}

#[tauri::command]
pub fn cmd_select_db(
    app_handle: tauri::AppHandle,
    conn_id: String,
    db_index: u8,
) -> Result<(), String> {
    if db_index > 15 {
        return Err("db index must be in range 0-15".to_string());
    }
    connection_repo::update_connection_db_index(&app_handle, &conn_id, db_index)?;
    let conn = get_conn_info(&app_handle, &conn_id)?;
    let password = connection_repo::get_password(&app_handle, &conn_id)?;
    super::pool::connect(&conn_id, &conn, password.as_deref())
}

#[tauri::command]
pub fn cmd_scan_keys(
    app_handle: tauri::AppHandle,
    conn_id: String,
    pattern: String,
    cursor: u64,
    count: u32,
) -> Result<ScanResult, String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    let (next_cursor, keys): (u64, Vec<String>) = redis::cmd("SCAN")
        .arg(cursor)
        .arg("MATCH")
        .arg(if pattern.is_empty() {
            "*".to_string()
        } else {
            pattern
        })
        .arg("COUNT")
        .arg(count.max(1))
        .query(&mut conn)
        .map_err(|err| format!("SCAN failed: {err}"))?;

    let mut out = Vec::with_capacity(keys.len());
    for key in keys {
        let key_type = redis::cmd("TYPE")
            .arg(&key)
            .query::<String>(&mut conn)
            .unwrap_or_else(|_| "unknown".to_string());
        let ttl = redis::cmd("TTL").arg(&key).query::<i64>(&mut conn).unwrap_or(-2);
        out.push(KeyMeta { key, key_type, ttl });
    }
    Ok(ScanResult {
        next_cursor,
        keys: out,
    })
}

#[tauri::command]
pub fn cmd_get_key_type(
    app_handle: tauri::AppHandle,
    conn_id: String,
    key: String,
) -> Result<String, String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("TYPE")
        .arg(key)
        .query(&mut conn)
        .map_err(|err| format!("TYPE failed: {err}"))
}

#[tauri::command]
pub fn cmd_get_ttl(
    app_handle: tauri::AppHandle,
    conn_id: String,
    key: String,
) -> Result<i64, String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("TTL")
        .arg(key)
        .query(&mut conn)
        .map_err(|err| format!("TTL failed: {err}"))
}

#[tauri::command]
pub fn cmd_set_ttl(
    app_handle: tauri::AppHandle,
    conn_id: String,
    key: String,
    ttl_seconds: u64,
) -> Result<(), String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("EXPIRE")
        .arg(key)
        .arg(ttl_seconds)
        .query::<i64>(&mut conn)
        .map(|_| ())
        .map_err(|err| format!("EXPIRE failed: {err}"))
}

#[tauri::command]
pub fn cmd_delete_keys(
    app_handle: tauri::AppHandle,
    conn_id: String,
    keys: Vec<String>,
) -> Result<u64, String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("DEL")
        .arg(keys)
        .query(&mut conn)
        .map_err(|err| format!("DEL failed: {err}"))
}

#[tauri::command]
pub fn cmd_rename_key(
    app_handle: tauri::AppHandle,
    conn_id: String,
    old_key: String,
    new_key: String,
) -> Result<(), String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("RENAME")
        .arg(old_key)
        .arg(new_key)
        .query::<String>(&mut conn)
        .map(|_| ())
        .map_err(|err| format!("RENAME failed: {err}"))
}

#[tauri::command]
pub fn cmd_key_exists(
    app_handle: tauri::AppHandle,
    conn_id: String,
    key: String,
) -> Result<bool, String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("EXISTS")
        .arg(key)
        .query::<i64>(&mut conn)
        .map(|value| value > 0)
        .map_err(|err| format!("EXISTS failed: {err}"))
}

#[tauri::command]
pub fn cmd_get_string(
    app_handle: tauri::AppHandle,
    conn_id: String,
    key: String,
) -> Result<String, String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("GET")
        .arg(key)
        .query::<Option<String>>(&mut conn)
        .map(|v| v.unwrap_or_default())
        .map_err(|err| format!("GET failed: {err}"))
}

#[tauri::command]
pub fn cmd_set_string(
    app_handle: tauri::AppHandle,
    conn_id: String,
    key: String,
    value: String,
    ttl: Option<u64>,
) -> Result<(), String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("SET")
        .arg(&key)
        .arg(value)
        .query::<String>(&mut conn)
        .map_err(|err| format!("SET failed: {err}"))?;
    if let Some(seconds) = ttl {
        redis::cmd("EXPIRE")
            .arg(key)
            .arg(seconds)
            .query::<i64>(&mut conn)
            .map_err(|err| format!("EXPIRE after SET failed: {err}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn cmd_hgetall(
    app_handle: tauri::AppHandle,
    conn_id: String,
    key: String,
) -> Result<Vec<HashField>, String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    let values: HashMap<String, String> = redis::cmd("HGETALL")
        .arg(key)
        .query(&mut conn)
        .map_err(|err| format!("HGETALL failed: {err}"))?;
    Ok(values
        .into_iter()
        .map(|(field, value)| HashField { field, value })
        .collect())
}

#[tauri::command]
pub fn cmd_hset(
    app_handle: tauri::AppHandle,
    conn_id: String,
    key: String,
    field: String,
    value: String,
) -> Result<(), String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("HSET")
        .arg(key)
        .arg(field)
        .arg(value)
        .query::<i64>(&mut conn)
        .map(|_| ())
        .map_err(|err| format!("HSET failed: {err}"))
}

#[tauri::command]
pub fn cmd_hdel(
    app_handle: tauri::AppHandle,
    conn_id: String,
    key: String,
    field: String,
) -> Result<(), String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("HDEL")
        .arg(key)
        .arg(field)
        .query::<i64>(&mut conn)
        .map(|_| ())
        .map_err(|err| format!("HDEL failed: {err}"))
}

#[tauri::command]
pub fn cmd_lrange(
    app_handle: tauri::AppHandle,
    conn_id: String,
    key: String,
    start: i64,
    stop: i64,
) -> Result<Vec<String>, String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("LRANGE")
        .arg(key)
        .arg(start)
        .arg(stop)
        .query(&mut conn)
        .map_err(|err| format!("LRANGE failed: {err}"))
}

#[tauri::command]
pub fn cmd_llen(app_handle: tauri::AppHandle, conn_id: String, key: String) -> Result<i64, String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("LLEN")
        .arg(key)
        .query(&mut conn)
        .map_err(|err| format!("LLEN failed: {err}"))
}

#[tauri::command]
pub fn cmd_lset(
    app_handle: tauri::AppHandle,
    conn_id: String,
    key: String,
    index: i64,
    value: String,
) -> Result<(), String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("LSET")
        .arg(key)
        .arg(index)
        .arg(value)
        .query::<String>(&mut conn)
        .map(|_| ())
        .map_err(|err| format!("LSET failed: {err}"))
}

#[tauri::command]
pub fn cmd_lpush(
    app_handle: tauri::AppHandle,
    conn_id: String,
    key: String,
    value: String,
) -> Result<(), String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("LPUSH")
        .arg(key)
        .arg(value)
        .query::<i64>(&mut conn)
        .map(|_| ())
        .map_err(|err| format!("LPUSH failed: {err}"))
}

#[tauri::command]
pub fn cmd_rpush(
    app_handle: tauri::AppHandle,
    conn_id: String,
    key: String,
    value: String,
) -> Result<(), String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("RPUSH")
        .arg(key)
        .arg(value)
        .query::<i64>(&mut conn)
        .map(|_| ())
        .map_err(|err| format!("RPUSH failed: {err}"))
}

#[tauri::command]
pub fn cmd_lrem(
    app_handle: tauri::AppHandle,
    conn_id: String,
    key: String,
    count: i64,
    value: String,
) -> Result<(), String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("LREM")
        .arg(key)
        .arg(count)
        .arg(value)
        .query::<i64>(&mut conn)
        .map(|_| ())
        .map_err(|err| format!("LREM failed: {err}"))
}

#[tauri::command]
pub fn cmd_smembers(
    app_handle: tauri::AppHandle,
    conn_id: String,
    key: String,
) -> Result<Vec<String>, String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("SMEMBERS")
        .arg(key)
        .query(&mut conn)
        .map_err(|err| format!("SMEMBERS failed: {err}"))
}

#[tauri::command]
pub fn cmd_sadd(
    app_handle: tauri::AppHandle,
    conn_id: String,
    key: String,
    member: String,
) -> Result<(), String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("SADD")
        .arg(key)
        .arg(member)
        .query::<i64>(&mut conn)
        .map(|_| ())
        .map_err(|err| format!("SADD failed: {err}"))
}

#[tauri::command]
pub fn cmd_srem(
    app_handle: tauri::AppHandle,
    conn_id: String,
    key: String,
    member: String,
) -> Result<(), String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("SREM")
        .arg(key)
        .arg(member)
        .query::<i64>(&mut conn)
        .map(|_| ())
        .map_err(|err| format!("SREM failed: {err}"))
}

#[tauri::command]
pub fn cmd_zrange_withscores(
    app_handle: tauri::AppHandle,
    conn_id: String,
    key: String,
    start: i64,
    stop: i64,
) -> Result<Vec<ZMember>, String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    let values: Vec<(String, f64)> = redis::cmd("ZRANGE")
        .arg(key)
        .arg(start)
        .arg(stop)
        .arg("WITHSCORES")
        .query(&mut conn)
        .map_err(|err| format!("ZRANGE WITHSCORES failed: {err}"))?;
    Ok(values
        .into_iter()
        .map(|(member, score)| ZMember { member, score })
        .collect())
}

#[tauri::command]
pub fn cmd_zcard(app_handle: tauri::AppHandle, conn_id: String, key: String) -> Result<i64, String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("ZCARD")
        .arg(key)
        .query(&mut conn)
        .map_err(|err| format!("ZCARD failed: {err}"))
}

#[tauri::command]
pub fn cmd_zadd(
    app_handle: tauri::AppHandle,
    conn_id: String,
    key: String,
    score: f64,
    member: String,
) -> Result<(), String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("ZADD")
        .arg(key)
        .arg(score)
        .arg(member)
        .query::<i64>(&mut conn)
        .map(|_| ())
        .map_err(|err| format!("ZADD failed: {err}"))
}

#[tauri::command]
pub fn cmd_zrem(
    app_handle: tauri::AppHandle,
    conn_id: String,
    key: String,
    member: String,
) -> Result<(), String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("ZREM")
        .arg(key)
        .arg(member)
        .query::<i64>(&mut conn)
        .map(|_| ())
        .map_err(|err| format!("ZREM failed: {err}"))
}

#[tauri::command]
pub fn cmd_zscore(
    app_handle: tauri::AppHandle,
    conn_id: String,
    key: String,
    member: String,
) -> Result<Option<f64>, String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    redis::cmd("ZSCORE")
        .arg(key)
        .arg(member)
        .query(&mut conn)
        .map_err(|err| format!("ZSCORE failed: {err}"))
}

#[tauri::command]
pub fn cmd_zrange_by_score(
    app_handle: tauri::AppHandle,
    conn_id: String,
    key: String,
    min_score: String,
    max_score: String,
) -> Result<Vec<ZMember>, String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    let values: Vec<(String, f64)> = redis::cmd("ZRANGEBYSCORE")
        .arg(key)
        .arg(min_score)
        .arg(max_score)
        .arg("WITHSCORES")
        .query(&mut conn)
        .map_err(|err| format!("ZRANGEBYSCORE WITHSCORES failed: {err}"))?;
    Ok(values
        .into_iter()
        .map(|(member, score)| ZMember { member, score })
        .collect())
}

#[tauri::command]
pub fn cmd_execute_raw(
    app_handle: tauri::AppHandle,
    conn_id: String,
    command: String,
    confirm_dangerous: Option<bool>,
) -> Result<RedisValue, String> {
    let danger = ["FLUSHALL", "FLUSHDB", "CONFIG SET", "SHUTDOWN"];
    let upper = command.trim().to_uppercase();
    if danger.iter().any(|item| upper.starts_with(item)) && !confirm_dangerous.unwrap_or(false) {
        return Err("dangerous command requires confirmation".to_string());
    }

    write_history(&app_handle, &conn_id, &command)?;
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    let args: Vec<&str> = command.split_whitespace().collect();
    if args.is_empty() {
        return Ok(RedisValue::Nil);
    }

    let mut cmd = redis::cmd(args[0]);
    for arg in args.iter().skip(1) {
        cmd.arg(arg);
    }
    cmd.query::<redis::Value>(&mut conn)
        .map(redis_to_value)
        .map_err(|err| format!("execute raw failed: {err}"))
}

#[tauri::command]
pub fn cmd_list_query_history(
    app_handle: tauri::AppHandle,
    conn_id: String,
    limit: Option<u32>,
) -> Result<Vec<String>, String> {
    list_history(&app_handle, &conn_id, limit.unwrap_or(100).max(1))
}

#[tauri::command]
pub fn cmd_get_server_info(
    app_handle: tauri::AppHandle,
    conn_id: String,
) -> Result<ServerInfo, String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    let raw = redis::cmd("INFO")
        .arg("all")
        .query::<String>(&mut conn)
        .map_err(|err| format!("INFO all failed: {err}"))?;
    Ok(parse_info_sections(&raw))
}

#[tauri::command]
pub fn cmd_get_slowlog(
    app_handle: tauri::AppHandle,
    conn_id: String,
    count: u32,
) -> Result<Vec<SlowlogEntry>, String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    let values: redis::Value = redis::cmd("SLOWLOG")
        .arg("GET")
        .arg(count.max(1))
        .query(&mut conn)
        .map_err(|err| format!("SLOWLOG GET failed: {err}"))?;

    let mut out = Vec::new();
    if let redis::Value::Array(rows) = values {
        for row in rows {
            if let redis::Value::Array(items) = row {
                if items.len() >= 4 {
                    let id = match &items[0] {
                        redis::Value::Int(v) => *v,
                        _ => 0,
                    };
                    let ts = match &items[1] {
                        redis::Value::Int(v) => *v,
                        _ => 0,
                    };
                    let duration = match &items[2] {
                        redis::Value::Int(v) => *v,
                        _ => 0,
                    };
                    let command = match &items[3] {
                        redis::Value::Array(args) => args
                            .iter()
                            .map(|v| match v {
                                redis::Value::BulkString(b) => {
                                    String::from_utf8_lossy(b).to_string()
                                }
                                redis::Value::SimpleString(s) => s.clone(),
                                _ => String::new(),
                            })
                            .collect::<Vec<_>>()
                            .join(" "),
                        _ => String::new(),
                    };
                    out.push(SlowlogEntry {
                        id,
                        timestamp: ts,
                        duration_micros: duration,
                        command,
                    });
                }
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn cmd_get_dbsize(
    app_handle: tauri::AppHandle,
    conn_id: String,
) -> Result<HashMap<u8, u64>, String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    let raw = redis::cmd("INFO")
        .arg("keyspace")
        .query::<String>(&mut conn)
        .map_err(|err| format!("INFO keyspace failed: {err}"))?;
    let mut out = HashMap::new();
    for line in raw.lines() {
        if let Some((name, info)) = line.split_once(':') {
            if let Some(index) = name.strip_prefix("db") {
                if let Ok(db) = index.parse::<u8>() {
                    if let Some(kv) = info.split(',').find(|item| item.starts_with("keys=")) {
                        let count = kv.trim_start_matches("keys=").parse::<u64>().unwrap_or(0);
                        out.insert(db, count);
                    }
                }
            }
        }
    }
    Ok(out)
}

fn read_export_value(conn: &mut redis::Connection, key: &str, key_type: &str) -> serde_json::Value {
    match key_type {
        "string" => redis::cmd("GET")
            .arg(key)
            .query::<Option<String>>(conn)
            .ok()
            .flatten()
            .map_or(serde_json::Value::Null, |v| json!(v)),
        "hash" => redis::cmd("HGETALL")
            .arg(key)
            .query::<HashMap<String, String>>(conn)
            .map_or(serde_json::Value::Null, |v| json!(v)),
        "list" => redis::cmd("LRANGE")
            .arg(key)
            .arg(0)
            .arg(-1)
            .query::<Vec<String>>(conn)
            .map_or(serde_json::Value::Null, |v| json!(v)),
        "set" => redis::cmd("SMEMBERS")
            .arg(key)
            .query::<Vec<String>>(conn)
            .map_or(serde_json::Value::Null, |v| json!(v)),
        "zset" => redis::cmd("ZRANGE")
            .arg(key)
            .arg(0)
            .arg(-1)
            .arg("WITHSCORES")
            .query::<Vec<(String, f64)>>(conn)
            .map_or(serde_json::Value::Null, |v| json!(v)),
        _ => serde_json::Value::Null,
    }
}

#[tauri::command]
pub fn cmd_export_keys(
    app_handle: tauri::AppHandle,
    conn_id: String,
    keys: Vec<String>,
    format: ExportFormat,
) -> Result<String, String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    let mut items = Vec::with_capacity(keys.len());
    for key in keys {
        let key_type = redis::cmd("TYPE")
            .arg(&key)
            .query::<String>(&mut conn)
            .unwrap_or_else(|_| "unknown".to_string());
        let ttl = redis::cmd("TTL").arg(&key).query::<i64>(&mut conn).unwrap_or(-2);
        let value = read_export_value(&mut conn, &key, &key_type);
        items.push(ExportItem {
            key,
            key_type,
            ttl,
            value,
        });
    }

    let export_dir = crate::db::init::data_dir(&app_handle)?.join("exports");
    fs::create_dir_all(&export_dir).map_err(|err| format!("create export dir failed: {err}"))?;
    let file_path = match format {
        ExportFormat::Json => export_dir.join(format!("export-{}.json", Utc::now().timestamp())),
        ExportFormat::Csv => export_dir.join(format!("export-{}.csv", Utc::now().timestamp())),
    };

    match format {
        ExportFormat::Json => {
            let text = serde_json::to_string_pretty(&items)
                .map_err(|err| format!("serialize json failed: {err}"))?;
            fs::write(&file_path, text).map_err(|err| format!("write export failed: {err}"))?;
        }
        ExportFormat::Csv => {
            let mut csv = String::from("key,type,ttl,value\n");
            for item in items {
                let value = item.value.to_string().replace('\"', "\"\"");
                csv.push_str(&format!(
                    "\"{}\",\"{}\",{},\"{}\"\n",
                    item.key.replace('\"', "\"\""),
                    item.key_type,
                    item.ttl,
                    value
                ));
            }
            fs::write(&file_path, csv).map_err(|err| format!("write export failed: {err}"))?;
        }
    }
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn cmd_import_keys(
    app_handle: tauri::AppHandle,
    conn_id: String,
    file_path: String,
) -> Result<ImportResult, String> {
    let mut conn = get_sync_conn(&app_handle, &conn_id)?;
    let text = fs::read_to_string(&file_path).map_err(|err| format!("read import file failed: {err}"))?;
    let parsed: Vec<ExportItem> =
        serde_json::from_str(&text).map_err(|err| format!("parse import json failed: {err}"))?;

    let mut success_count = 0usize;
    let mut failed_count = 0usize;
    let mut errors = Vec::new();

    for item in parsed {
        let result: Result<(), String> = (|| {
            match item.key_type.as_str() {
                "string" => {
                    let value = item.value.as_str().unwrap_or_default().to_string();
                    redis::cmd("SET")
                        .arg(&item.key)
                        .arg(value)
                        .query::<String>(&mut conn)
                        .map_err(|err| format!("SET failed: {err}"))?;
                }
                "hash" => {
                    let map: HashMap<String, String> = serde_json::from_value(item.value.clone())
                        .map_err(|err| format!("hash parse failed: {err}"))?;
                    for (field, value) in map {
                        redis::cmd("HSET")
                            .arg(&item.key)
                            .arg(field)
                            .arg(value)
                            .query::<i64>(&mut conn)
                            .map_err(|err| format!("HSET failed: {err}"))?;
                    }
                }
                "list" => {
                    let list: Vec<String> = serde_json::from_value(item.value.clone())
                        .map_err(|err| format!("list parse failed: {err}"))?;
                    for value in list {
                        redis::cmd("RPUSH")
                            .arg(&item.key)
                            .arg(value)
                            .query::<i64>(&mut conn)
                            .map_err(|err| format!("RPUSH failed: {err}"))?;
                    }
                }
                "set" => {
                    let set: Vec<String> = serde_json::from_value(item.value.clone())
                        .map_err(|err| format!("set parse failed: {err}"))?;
                    for value in set {
                        redis::cmd("SADD")
                            .arg(&item.key)
                            .arg(value)
                            .query::<i64>(&mut conn)
                            .map_err(|err| format!("SADD failed: {err}"))?;
                    }
                }
                "zset" => {
                    let pairs: Vec<(String, f64)> = serde_json::from_value(item.value.clone())
                        .map_err(|err| format!("zset parse failed: {err}"))?;
                    for (member, score) in pairs {
                        redis::cmd("ZADD")
                            .arg(&item.key)
                            .arg(score)
                            .arg(member)
                            .query::<i64>(&mut conn)
                            .map_err(|err| format!("ZADD failed: {err}"))?;
                    }
                }
                _ => {}
            }
            if item.ttl > 0 {
                redis::cmd("EXPIRE")
                    .arg(&item.key)
                    .arg(item.ttl)
                    .query::<i64>(&mut conn)
                    .map_err(|err| format!("EXPIRE failed: {err}"))?;
            }
            Ok(())
        })();

        match result {
            Ok(_) => success_count += 1,
            Err(err) => {
                failed_count += 1;
                errors.push(format!("{}: {}", item.key, err));
            }
        }
    }

    Ok(ImportResult {
        success_count,
        failed_count,
        errors,
    })
}

#[tauri::command]
pub fn cmd_pick_import_file(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
    let import_dir = crate::db::init::data_dir(&app_handle)?.join("imports");
    fs::create_dir_all(&import_dir).map_err(|err| format!("create import dir failed: {err}"))?;
    let mut found: Option<PathBuf> = None;
    for entry in fs::read_dir(&import_dir).map_err(|err| format!("read import dir failed: {err}"))? {
        let entry = entry.map_err(|err| format!("read import entry failed: {err}"))?;
        let path = entry.path();
        if path.extension().map(|e| e == "json").unwrap_or(false) {
            found = Some(path);
            break;
        }
    }
    Ok(found.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn cmd_preview_import_file(
    file_path: String,
    count: Option<u32>,
) -> Result<Vec<ExportItem>, String> {
    let text = fs::read_to_string(&file_path).map_err(|err| format!("read preview file failed: {err}"))?;
    let parsed: Vec<ExportItem> =
        serde_json::from_str(&text).map_err(|err| format!("parse preview json failed: {err}"))?;
    Ok(parsed.into_iter().take(count.unwrap_or(10) as usize).collect())
}
