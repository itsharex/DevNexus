use rusqlite::{params, Connection, OptionalExtension};
use super::types::*;
use super::utils::{json_or_empty, normalize_hosts, redact_json, trim_option};

fn open_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let path = crate::db::init::db_path(app_handle)?;
    Connection::open(path).map_err(|err| format!("failed to open db: {err}"))
}

fn row_to_connection(row: &rusqlite::Row<'_>) -> rusqlite::Result<MqConnectionInfo> {
    let hosts_json: String = row.get(4)?;
    let rabbit_json: Option<String> = row.get(8)?;
    let kafka_json: Option<String> = row.get(9)?;
    Ok(MqConnectionInfo {
        id: row.get(0)?,
        name: row.get(1)?,
        group_name: row.get(2)?,
        broker_type: row.get(3)?,
        hosts: serde_json::from_str(&hosts_json).unwrap_or_default(),
        username: row.get(5)?,
        connect_timeout: row.get::<_, i64>(7)?.max(1) as u64,
        rabbitmq: rabbit_json.and_then(|value| serde_json::from_str(&value).ok()),
        kafka: kafka_json.and_then(|value| serde_json::from_str(&value).ok()),
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn get_secret(app: &tauri::AppHandle, id: &str) -> Result<Option<MqConnectionSecret>, String> {
    let conn = open_db(app)?;
    let row = conn
        .query_row(
            "SELECT password_encrypted, rabbitmq_management_password_encrypted, kafka_sasl_password_encrypted FROM mq_connections WHERE id = ?1",
            params![id],
            |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, Option<String>>(1)?, row.get::<_, Option<String>>(2)?)),
        )
        .optional()
        .map_err(|err| format!("query MQ secret failed: {err}"))?;
    row.map(|(password, management, sasl)| {
        Ok(MqConnectionSecret {
            password: password.map(|value| crate::crypto::decrypt(app, &value)).transpose()?,
            rabbitmq_management_password: management.map(|value| crate::crypto::decrypt(app, &value)).transpose()?,
            kafka_sasl_password: sasl.map(|value| crate::crypto::decrypt(app, &value)).transpose()?,
        })
    }).transpose()
}

fn merge_secrets(app: &tauri::AppHandle, id: &str, form: &mut MqConnectionForm) -> Result<(Option<String>, Option<String>, Option<String>), String> {
    let current = get_secret(app, id)?.unwrap_or(MqConnectionSecret { password: None, rabbitmq_management_password: None, kafka_sasl_password: None });
    let password = form.password.take().filter(|value| !value.is_empty()).or(current.password);
    let management_password = form.rabbitmq.as_mut().and_then(|item| item.management_password.take()).filter(|value| !value.is_empty()).or(current.rabbitmq_management_password);
    let sasl_password = form.kafka.as_mut().and_then(|item| item.sasl_password.take()).filter(|value| !value.is_empty()).or(current.kafka_sasl_password);
    Ok((password, management_password, sasl_password))
}

fn hydrate_secret(app: &tauri::AppHandle, mut info: MqConnectionInfo) -> Result<MqConnectionInfo, String> {
    if let Some(secret) = get_secret(app, &info.id)? {
        if let Some(config) = info.rabbitmq.as_mut() {
            config.management_password = secret.rabbitmq_management_password;
        }
        if let Some(config) = info.kafka.as_mut() {
            config.sasl_password = secret.kafka_sasl_password;
        }
    }
    Ok(info)
}

#[tauri::command]
pub fn cmd_mq_list_connections(app: tauri::AppHandle) -> Result<Vec<MqConnectionInfo>, String> {
    let conn = open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT id, name, group_name, broker_type, hosts_json, username, password_encrypted, connect_timeout, rabbitmq_json, kafka_json, created_at, updated_at FROM mq_connections ORDER BY updated_at DESC")
        .map_err(|err| format!("prepare MQ list failed: {err}"))?;
    let rows = stmt.query_map([], row_to_connection).map_err(|err| format!("query MQ connections failed: {err}"))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|err| format!("parse MQ connection failed: {err}"))
}

fn get_connection(app: &tauri::AppHandle, id: &str, hydrate: bool) -> Result<MqConnectionInfo, String> {
    let conn = open_db(app)?;
    let mut stmt = conn
        .prepare("SELECT id, name, group_name, broker_type, hosts_json, username, password_encrypted, connect_timeout, rabbitmq_json, kafka_json, created_at, updated_at FROM mq_connections WHERE id = ?1")
        .map_err(|err| format!("prepare MQ get failed: {err}"))?;
    let info = stmt
        .query_row(params![id], row_to_connection)
        .optional()
        .map_err(|err| format!("get MQ connection failed: {err}"))?
        .ok_or_else(|| "MQ connection not found".to_string())?;
    if hydrate { hydrate_secret(app, info) } else { Ok(info) }
}

#[tauri::command]
pub fn cmd_mq_save_connection(app: tauri::AppHandle, mut form: MqConnectionForm) -> Result<String, String> {
    let id = form.id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    if form.name.trim().is_empty() { return Err("name is required".into()); }
    if form.broker_type != "rabbitmq" && form.broker_type != "kafka" { return Err("broker type must be rabbitmq or kafka".into()); }
    let hosts = normalize_hosts(form.hosts.clone());
    if hosts.is_empty() { return Err("at least one host is required".into()); }
    let (password, management_password, sasl_password) = merge_secrets(&app, &id, &mut form)?;
    let password_encrypted = password.map(|value| crate::crypto::encrypt(&app, &value)).transpose()?;
    let management_encrypted = management_password.map(|value| crate::crypto::encrypt(&app, &value)).transpose()?;
    let sasl_encrypted = sasl_password.map(|value| crate::crypto::encrypt(&app, &value)).transpose()?;
    let now = super::utils::now();
    let conn = open_db(&app)?;
    conn.execute(
        r#"
        INSERT INTO mq_connections (
          id, name, group_name, broker_type, hosts_json, username, password_encrypted,
          connect_timeout, rabbitmq_json, rabbitmq_management_password_encrypted,
          kafka_json, kafka_sasl_password_encrypted, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          group_name = excluded.group_name,
          broker_type = excluded.broker_type,
          hosts_json = excluded.hosts_json,
          username = excluded.username,
          password_encrypted = excluded.password_encrypted,
          connect_timeout = excluded.connect_timeout,
          rabbitmq_json = excluded.rabbitmq_json,
          rabbitmq_management_password_encrypted = excluded.rabbitmq_management_password_encrypted,
          kafka_json = excluded.kafka_json,
          kafka_sasl_password_encrypted = excluded.kafka_sasl_password_encrypted,
          updated_at = excluded.updated_at
        "#,
        params![
            id,
            form.name.trim(),
            trim_option(form.group_name),
            form.broker_type,
            json_or_empty(&hosts, "[]"),
            trim_option(form.username),
            password_encrypted,
            form.connect_timeout.unwrap_or(10).max(1),
            form.rabbitmq.as_ref().map(|item| json_or_empty(item, "null")),
            management_encrypted,
            form.kafka.as_ref().map(|item| json_or_empty(item, "null")),
            sasl_encrypted,
            now,
            now,
        ],
    ).map_err(|err| format!("save MQ connection failed: {err}"))?;
    Ok(id)
}

#[tauri::command]
pub fn cmd_mq_delete_connection(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute("DELETE FROM mq_connections WHERE id = ?1", params![id]).map_err(|err| format!("delete MQ connection failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_mq_test_connection(app: tauri::AppHandle, id: String) -> Result<MqConnectionDiagnostics, String> {
    let conn = get_connection(&app, &id, true)?;
    Ok(match conn.broker_type.as_str() {
        "rabbitmq" => super::rabbitmq::test_connection(&conn).await,
        "kafka" => super::kafka::test_connection(&conn).await,
        _ => return Err("unsupported broker type".into()),
    })
}

#[tauri::command]
pub async fn cmd_mq_browse(app: tauri::AppHandle, conn_id: String) -> Result<Vec<MqResourceNode>, String> {
    let conn = get_connection(&app, &conn_id, true)?;
    match conn.broker_type.as_str() {
        "rabbitmq" => super::rabbitmq::browse(&conn).await,
        "kafka" => super::kafka::browse(&conn).await,
        _ => Err("unsupported broker type".into()),
    }
}

fn insert_history(app: &tauri::AppHandle, conn_id: &str, broker_type: &str, operation_type: &str, target: &str, status: &str, duration_ms: u64, request: serde_json::Value, result: serde_json::Value) -> Result<(), String> {
    let conn = open_db(app)?;
    conn.execute(
        "INSERT INTO mq_message_history (id, broker_type, connection_id, operation_type, target, status, duration_ms, request_json, result_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![uuid::Uuid::new_v4().to_string(), broker_type, conn_id, operation_type, target, status, duration_ms, redact_json(request).to_string(), redact_json(result).to_string(), super::utils::now()],
    ).map_err(|err| format!("save MQ history failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_mq_publish(app: tauri::AppHandle, request: MqPublishRequest) -> Result<MqOperationResult, String> {
    let conn = get_connection(&app, &request.conn_id, true)?;
    let result = match conn.broker_type.as_str() {
        "rabbitmq" => super::rabbitmq::publish(&conn, &request).await,
        "kafka" => super::kafka::publish(&conn, &request).await,
        _ => return Err("unsupported broker type".into()),
    };
    if request.save_history.unwrap_or(true) {
        insert_history(&app, &request.conn_id, &conn.broker_type, "publish", &request.target, &result.status, result.duration_ms, serde_json::to_value(&request).unwrap_or_default(), serde_json::to_value(&result).unwrap_or_default())?;
    }
    Ok(result)
}

#[tauri::command]
pub async fn cmd_mq_consume_preview(app: tauri::AppHandle, request: MqConsumeRequest) -> Result<MqOperationResult, String> {
    let conn = get_connection(&app, &request.conn_id, true)?;
    let result = match conn.broker_type.as_str() {
        "rabbitmq" => super::rabbitmq::consume(&conn, &request).await,
        "kafka" => super::kafka::consume(&conn, &request).await,
        _ => return Err("unsupported broker type".into()),
    };
    if request.save_history.unwrap_or(true) {
        insert_history(&app, &request.conn_id, &conn.broker_type, "consume", &request.target, &result.status, result.duration_ms, serde_json::to_value(&request).unwrap_or_default(), serde_json::to_value(&result).unwrap_or_default())?;
    }
    Ok(result)
}

fn row_to_history(row: &rusqlite::Row<'_>) -> rusqlite::Result<MqHistoryItem> {
    Ok(MqHistoryItem { id: row.get(0)?, broker_type: row.get(1)?, connection_id: row.get(2)?, operation_type: row.get(3)?, target: row.get(4)?, status: row.get(5)?, duration_ms: row.get::<_, i64>(6)?.max(0) as u64, request_json: row.get(7)?, result_json: row.get(8)?, created_at: row.get(9)? })
}

#[tauri::command]
pub fn cmd_mq_list_history(app: tauri::AppHandle, filter: Option<MqHistoryFilter>) -> Result<Vec<MqHistoryItem>, String> {
    let filter = filter.unwrap_or(MqHistoryFilter { broker_type: None, connection_id: None, target: None, operation_type: None, status: None, limit: None });
    let conn = open_db(&app)?;
    let mut stmt = conn.prepare("SELECT id, broker_type, connection_id, operation_type, target, status, duration_ms, request_json, result_json, created_at FROM mq_message_history ORDER BY created_at DESC LIMIT ?1").map_err(|err| format!("prepare MQ history failed: {err}"))?;
    let limit = filter.limit.unwrap_or(200).min(500);
    let rows = stmt.query_map(params![limit], row_to_history).map_err(|err| format!("query MQ history failed: {err}"))?;
    let mut items = rows.collect::<Result<Vec<_>, _>>().map_err(|err| format!("parse MQ history failed: {err}"))?;
    items.retain(|item| {
        filter.broker_type.as_ref().map(|value| item.broker_type == *value).unwrap_or(true)
            && filter.connection_id.as_ref().map(|value| item.connection_id == *value).unwrap_or(true)
            && filter.target.as_ref().map(|value| item.target.contains(value)).unwrap_or(true)
            && filter.operation_type.as_ref().map(|value| item.operation_type == *value).unwrap_or(true)
            && filter.status.as_ref().map(|value| item.status == *value).unwrap_or(true)
    });
    Ok(items)
}

#[tauri::command]
pub fn cmd_mq_delete_history(app: tauri::AppHandle, id: String) -> Result<(), String> {
    open_db(&app)?.execute("DELETE FROM mq_message_history WHERE id = ?1", params![id]).map_err(|err| format!("delete MQ history failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub fn cmd_mq_clear_history(app: tauri::AppHandle) -> Result<(), String> {
    open_db(&app)?.execute("DELETE FROM mq_message_history", []).map_err(|err| format!("clear MQ history failed: {err}"))?;
    Ok(())
}

fn row_to_template(row: &rusqlite::Row<'_>) -> rusqlite::Result<MqSavedMessage> {
    let body_json: String = row.get(4)?;
    let headers_json: String = row.get(5)?;
    let properties_json: String = row.get(6)?;
    Ok(MqSavedMessage { id: row.get(0)?, broker_type: row.get(1)?, name: row.get(2)?, target: row.get(3)?, body: serde_json::from_str(&body_json).unwrap_or(EncodedMessageBody { encoding: "utf8".into(), text: String::new(), content_type: None, size_bytes: 0 }), headers: serde_json::from_str(&headers_json).unwrap_or_default(), properties: serde_json::from_str(&properties_json).unwrap_or_default(), created_at: row.get(7)?, updated_at: row.get(8)? })
}

#[tauri::command]
pub fn cmd_mq_list_saved_messages(app: tauri::AppHandle, broker_type: Option<String>) -> Result<Vec<MqSavedMessage>, String> {
    let conn = open_db(&app)?;
    let mut stmt = conn.prepare("SELECT id, broker_type, name, target, body_json, headers_json, properties_json, created_at, updated_at FROM mq_saved_messages ORDER BY updated_at DESC").map_err(|err| format!("prepare MQ templates failed: {err}"))?;
    let rows = stmt.query_map([], row_to_template).map_err(|err| format!("query MQ templates failed: {err}"))?;
    let mut items = rows.collect::<Result<Vec<_>, _>>().map_err(|err| format!("parse MQ template failed: {err}"))?;
    if let Some(value) = broker_type { items.retain(|item| item.broker_type == value); }
    Ok(items)
}

#[tauri::command]
pub fn cmd_mq_save_message_template(app: tauri::AppHandle, form: MqSavedMessageForm) -> Result<String, String> {
    let id = form.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let now = super::utils::now();
    open_db(&app)?.execute(
        "INSERT INTO mq_saved_messages (id, broker_type, name, target, body_json, headers_json, properties_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) ON CONFLICT(id) DO UPDATE SET broker_type = excluded.broker_type, name = excluded.name, target = excluded.target, body_json = excluded.body_json, headers_json = excluded.headers_json, properties_json = excluded.properties_json, updated_at = excluded.updated_at",
        params![id, form.broker_type, form.name, form.target, json_or_empty(&form.body, "{}"), json_or_empty(&form.headers, "[]"), json_or_empty(&form.properties, "[]"), now, now],
    ).map_err(|err| format!("save MQ template failed: {err}"))?;
    Ok(id)
}

#[tauri::command]
pub fn cmd_mq_delete_message_template(app: tauri::AppHandle, id: String) -> Result<(), String> {
    open_db(&app)?.execute("DELETE FROM mq_saved_messages WHERE id = ?1", params![id]).map_err(|err| format!("delete MQ template failed: {err}"))?;
    Ok(())
}
