use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::PathBuf;
use std::time::Instant;

use mysql_async::prelude::Queryable;
use mysql_async::{Pool, Row, Value};
use rusqlite::{params, Connection};

use crate::db::mysql_connection_repo::{self, MysqlConnectionForm, MysqlConnectionInfo};

use super::types::{
    MysqlColumnInfo, MysqlDatabaseInfo, MysqlImportResult, MysqlIndexInfo, MysqlLatency,
    MysqlQueryHistoryItem, MysqlRowPage, MysqlServerStatus, MysqlSqlResult, MysqlTableInfo,
    MysqlTableStatus,
};

fn open_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let path = crate::db::init::db_path(app_handle)?;
    Connection::open(path).map_err(|err| format!("failed to open db: {err}"))
}

fn quote_ident(input: &str) -> String {
    format!("`{}`", input.replace('`', "``"))
}

fn sql_string(input: &str) -> String {
    format!("'{}'", input.replace('\\', "\\\\").replace('\'', "''"))
}

fn json_to_sql(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Null => "NULL".to_string(),
        serde_json::Value::Bool(value) => if *value { "1" } else { "0" }.to_string(),
        serde_json::Value::Number(value) => value.to_string(),
        serde_json::Value::String(value) => sql_string(value),
        other => sql_string(&other.to_string()),
    }
}

fn value_to_json(value: Value) -> serde_json::Value {
    match value {
        Value::NULL => serde_json::Value::Null,
        Value::Bytes(bytes) => serde_json::Value::String(String::from_utf8_lossy(&bytes).to_string()),
        Value::Int(value) => serde_json::json!(value),
        Value::UInt(value) => serde_json::json!(value),
        Value::Float(value) => serde_json::json!(value),
        Value::Double(value) => serde_json::json!(value),
        Value::Date(year, month, day, hour, minute, second, micros) => serde_json::Value::String(format!(
            "{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}:{second:02}.{:06}",
            micros
        )),
        Value::Time(negative, days, hours, minutes, seconds, micros) => serde_json::Value::String(format!(
            "{}{} {hours:02}:{minutes:02}:{seconds:02}.{:06}",
            if negative { "-" } else { "" },
            days,
            micros
        )),
    }
}

fn rows_to_page(rows: Vec<Row>) -> (Vec<String>, Vec<serde_json::Value>) {
    let mut columns = Vec::new();
    let mut out = Vec::new();
    for row in rows {
        let row_columns: Vec<String> = row
            .columns_ref()
            .iter()
            .map(|col| col.name_str().to_string())
            .collect();
        if columns.is_empty() {
            columns = row_columns.clone();
        }
        let values = row.unwrap();
        let mut map = serde_json::Map::new();
        for (idx, value) in values.into_iter().enumerate() {
            let key = row_columns
                .get(idx)
                .cloned()
                .unwrap_or_else(|| format!("column_{idx}"));
            map.insert(key, value_to_json(value));
        }
        out.push(serde_json::Value::Object(map));
    }
    (columns, out)
}

async fn client_from_form(form: MysqlConnectionForm) -> Result<Pool, String> {
    let config = MysqlConnectionInfo {
        id: "__temp__".to_string(),
        name: form.name.clone(),
        group_name: form.group_name.clone(),
        host: form.host.clone(),
        port: form.port.unwrap_or(3306),
        username: form.username.clone(),
        default_database: form.default_database.clone(),
        charset: form.charset.clone().or_else(|| Some("utf8mb4".to_string())),
        ssl_mode: form.ssl_mode.clone().or_else(|| Some("preferred".to_string())),
        connect_timeout: form.connect_timeout.unwrap_or(10).max(1),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let secret = mysql_connection_repo::MysqlConnectionSecret {
        password: form.password,
    };
    super::client_pool::build_pool(&config, Some(secret))
}

async fn ping_pool(pool: &Pool) -> Result<Option<String>, String> {
    let mut conn = pool
        .get_conn()
        .await
        .map_err(|err| format!("mysql connect failed: {err}"))?;
    let version: Option<String> = conn
        .query_first("SELECT VERSION()")
        .await
        .map_err(|err| format!("mysql ping failed: {err}"))?;
    Ok(version)
}

fn parse_object(input: &str, label: &str) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    match serde_json::from_str::<serde_json::Value>(input).map_err(|err| format!("invalid {label} json: {err}"))? {
        serde_json::Value::Object(map) => Ok(map),
        _ => Err(format!("{label} must be a json object")),
    }
}

fn where_from_object(map: &serde_json::Map<String, serde_json::Value>) -> Result<String, String> {
    if map.is_empty() {
        return Err("primary key json cannot be empty".to_string());
    }
    Ok(map
        .iter()
        .map(|(key, value)| format!("{} = {}", quote_ident(key), json_to_sql(value)))
        .collect::<Vec<_>>()
        .join(" AND "))
}

async fn table_primary_keys(pool: &Pool, database: &str, table: &str) -> Result<Vec<String>, String> {
    let mut conn = pool
        .get_conn()
        .await
        .map_err(|err| format!("mysql connect failed: {err}"))?;
    conn.exec_map(
        r#"
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_KEY = 'PRI'
        ORDER BY ORDINAL_POSITION
        "#,
        (database, table),
        |name: String| name,
    )
    .await
    .map_err(|err| format!("query mysql primary keys failed: {err}"))
}

fn save_history(app_handle: &tauri::AppHandle, connection_id: &str, database: Option<String>, sql: &str) -> Result<(), String> {
    let conn = open_db(app_handle)?;
    conn.execute(
        r#"
        INSERT INTO mysql_query_history (id, connection_id, database_name, sql_text, executed_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        "#,
        params![
            uuid::Uuid::new_v4().to_string(),
            connection_id,
            database,
            sql,
            chrono::Utc::now().to_rfc3339(),
        ],
    )
    .map_err(|err| format!("save mysql query history failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub fn cmd_mysql_list_connections(app_handle: tauri::AppHandle) -> Result<Vec<MysqlConnectionInfo>, String> {
    mysql_connection_repo::list_mysql_connections(&app_handle)
}

#[tauri::command]
pub fn cmd_mysql_save_connection(app_handle: tauri::AppHandle, form: MysqlConnectionForm) -> Result<String, String> {
    mysql_connection_repo::save_mysql_connection(&app_handle, form)
}

#[tauri::command]
pub async fn cmd_mysql_delete_connection(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    super::client_pool::remove_pool(&id).await?;
    mysql_connection_repo::delete_mysql_connection(&app_handle, &id)
}

#[tauri::command]
pub async fn cmd_mysql_test_connection(form: MysqlConnectionForm) -> Result<MysqlLatency, String> {
    let started = Instant::now();
    let pool = client_from_form(form).await?;
    let server_version = ping_pool(&pool).await?;
    pool.disconnect().await.map_err(|err| format!("disconnect mysql test pool failed: {err}"))?;
    Ok(MysqlLatency { millis: started.elapsed().as_millis() as u64, server_version })
}

#[tauri::command]
pub async fn cmd_mysql_connect(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    let config = mysql_connection_repo::get_mysql_connection(&app_handle, &id)?
        .ok_or_else(|| format!("mysql connection `{id}` not found"))?;
    let secret = mysql_connection_repo::get_mysql_secret(&app_handle, &id)?;
    let pool = super::client_pool::build_pool(&config, secret)?;
    ping_pool(&pool).await?;
    super::client_pool::put_pool(&id, pool)
}

#[tauri::command]
pub async fn cmd_mysql_disconnect(id: String) -> Result<(), String> {
    super::client_pool::remove_pool(&id).await
}

#[tauri::command]
pub async fn cmd_mysql_list_databases(conn_id: String) -> Result<Vec<MysqlDatabaseInfo>, String> {
    let pool = super::client_pool::get_pool(&conn_id)?;
    let mut conn = pool.get_conn().await.map_err(|err| format!("mysql connect failed: {err}"))?;
    let names: Vec<String> = conn
        .query("SHOW DATABASES")
        .await
        .map_err(|err| format!("list mysql databases failed: {err}"))?;
    let hidden = ["information_schema", "performance_schema", "mysql", "sys"];
    Ok(names
        .into_iter()
        .filter(|name| !hidden.contains(&name.as_str()))
        .map(|name| MysqlDatabaseInfo { name })
        .collect())
}

#[tauri::command]
pub async fn cmd_mysql_list_tables(conn_id: String, database: String) -> Result<Vec<MysqlTableInfo>, String> {
    let pool = super::client_pool::get_pool(&conn_id)?;
    let mut conn = pool.get_conn().await.map_err(|err| format!("mysql connect failed: {err}"))?;
    let sql = r#"
        SELECT TABLE_NAME, TABLE_TYPE
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME
    "#;
    conn.exec_map(sql, (database.trim(),), |(name, table_type): (String, String)| MysqlTableInfo { name, table_type })
        .await
        .map_err(|err| format!("list mysql tables failed: {err}"))
}

#[tauri::command]
pub async fn cmd_mysql_describe_table(conn_id: String, database: String, table: String) -> Result<Vec<MysqlColumnInfo>, String> {
    let pool = super::client_pool::get_pool(&conn_id)?;
    let mut conn = pool.get_conn().await.map_err(|err| format!("mysql connect failed: {err}"))?;
    let sql = r#"
        SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
    "#;
    conn.exec_map(
        sql,
        (database.trim(), table.trim()),
        |(name, column_type, nullable, key, default_value, extra): (String, String, String, String, Option<String>, String)| MysqlColumnInfo {
            name,
            column_type,
            nullable: nullable == "YES",
            key,
            default_value,
            extra,
        },
    )
    .await
    .map_err(|err| format!("describe mysql table failed: {err}"))
}

#[tauri::command]
pub async fn cmd_mysql_get_table_status(conn_id: String, database: String, table: String) -> Result<MysqlTableStatus, String> {
    let pool = super::client_pool::get_pool(&conn_id)?;
    let mut conn = pool.get_conn().await.map_err(|err| format!("mysql connect failed: {err}"))?;
    let sql = r#"
        SELECT TABLE_NAME, ENGINE, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH, TABLE_COLLATION
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
    "#;
    conn.exec_first(sql, (database.trim(), table.trim()))
        .await
        .map_err(|err| format!("get mysql table status failed: {err}"))?
        .map(|(name, engine, rows, data_length, index_length, collation)| MysqlTableStatus {
            name,
            engine,
            rows,
            data_length,
            index_length,
            collation,
        })
        .ok_or_else(|| "mysql table status not found".to_string())
}

#[tauri::command]
pub async fn cmd_mysql_select_rows(
    conn_id: String,
    database: String,
    table: String,
    offset: Option<u64>,
    limit: Option<u64>,
) -> Result<MysqlRowPage, String> {
    let pool = super::client_pool::get_pool(&conn_id)?;
    let mut conn = pool.get_conn().await.map_err(|err| format!("mysql connect failed: {err}"))?;
    let db = quote_ident(database.trim());
    let tbl = quote_ident(table.trim());
    let total: Option<u64> = conn
        .query_first(format!("SELECT COUNT(*) FROM {db}.{tbl}"))
        .await
        .unwrap_or(Some(0));
    let rows: Vec<Row> = conn
        .query(format!(
            "SELECT * FROM {db}.{tbl} LIMIT {} OFFSET {}",
            limit.unwrap_or(100).clamp(1, 500),
            offset.unwrap_or(0)
        ))
        .await
        .map_err(|err| format!("select mysql rows failed: {err}"))?;
    let (columns, rows) = rows_to_page(rows);
    Ok(MysqlRowPage { columns, rows, total: total.unwrap_or(0) })
}

#[tauri::command]
pub async fn cmd_mysql_insert_row(conn_id: String, database: String, table: String, row_json: String) -> Result<u64, String> {
    let map = parse_object(&row_json, "row")?;
    if map.is_empty() {
        return Err("row cannot be empty".to_string());
    }
    let pool = super::client_pool::get_pool(&conn_id)?;
    let columns = map.keys().map(|key| quote_ident(key)).collect::<Vec<_>>().join(", ");
    let values = map.values().map(json_to_sql).collect::<Vec<_>>().join(", ");
    let sql = format!("INSERT INTO {}.{} ({columns}) VALUES ({values})", quote_ident(database.trim()), quote_ident(table.trim()));
    let mut conn = pool.get_conn().await.map_err(|err| format!("mysql connect failed: {err}"))?;
    conn.query_drop(sql).await.map_err(|err| format!("insert mysql row failed: {err}"))?;
    Ok(conn.affected_rows())
}

#[tauri::command]
pub async fn cmd_mysql_update_row(conn_id: String, database: String, table: String, pk_json: String, row_json: String) -> Result<u64, String> {
    let pk = parse_object(&pk_json, "primary key")?;
    let row = parse_object(&row_json, "row")?;
    let pool = super::client_pool::get_pool(&conn_id)?;
    let primary_keys = table_primary_keys(&pool, database.trim(), table.trim()).await?;
    if primary_keys.is_empty() {
        return Err("table has no primary key, update is disabled".to_string());
    }
    let assignments = row
        .iter()
        .filter(|(key, _)| !pk.contains_key(*key))
        .map(|(key, value)| format!("{} = {}", quote_ident(key), json_to_sql(value)))
        .collect::<Vec<_>>()
        .join(", ");
    if assignments.is_empty() {
        return Ok(0);
    }
    let sql = format!(
        "UPDATE {}.{} SET {assignments} WHERE {} LIMIT 1",
        quote_ident(database.trim()),
        quote_ident(table.trim()),
        where_from_object(&pk)?
    );
    let mut conn = pool.get_conn().await.map_err(|err| format!("mysql connect failed: {err}"))?;
    conn.query_drop(sql).await.map_err(|err| format!("update mysql row failed: {err}"))?;
    Ok(conn.affected_rows())
}

#[tauri::command]
pub async fn cmd_mysql_delete_row(conn_id: String, database: String, table: String, pk_json: String) -> Result<u64, String> {
    let pk = parse_object(&pk_json, "primary key")?;
    let pool = super::client_pool::get_pool(&conn_id)?;
    let primary_keys = table_primary_keys(&pool, database.trim(), table.trim()).await?;
    if primary_keys.is_empty() {
        return Err("table has no primary key, delete is disabled".to_string());
    }
    let sql = format!(
        "DELETE FROM {}.{} WHERE {} LIMIT 1",
        quote_ident(database.trim()),
        quote_ident(table.trim()),
        where_from_object(&pk)?
    );
    let mut conn = pool.get_conn().await.map_err(|err| format!("mysql connect failed: {err}"))?;
    conn.query_drop(sql).await.map_err(|err| format!("delete mysql row failed: {err}"))?;
    Ok(conn.affected_rows())
}

#[tauri::command]
pub async fn cmd_mysql_execute_sql(app_handle: tauri::AppHandle, conn_id: String, database: Option<String>, sql: String) -> Result<MysqlSqlResult, String> {
    let pool = super::client_pool::get_pool(&conn_id)?;
    let mut conn = pool.get_conn().await.map_err(|err| format!("mysql connect failed: {err}"))?;
    if let Some(database) = database.clone().filter(|value| !value.trim().is_empty()) {
        conn.query_drop(format!("USE {}", quote_ident(database.trim())))
            .await
            .map_err(|err| format!("select mysql database failed: {err}"))?;
    }
    let trimmed = sql.trim();
    let keyword = trimmed.split_whitespace().next().unwrap_or_default().to_ascii_lowercase();
    let is_query = matches!(keyword.as_str(), "select" | "show" | "describe" | "desc" | "explain");
    let result = if is_query {
        let rows: Vec<Row> = conn.query(trimmed).await.map_err(|err| format!("execute mysql query failed: {err}"))?;
        let (columns, rows) = rows_to_page(rows);
        MysqlSqlResult { columns, rows, affected_rows: 0, last_insert_id: None, message: "Query executed".to_string() }
    } else {
        conn.query_drop(trimmed).await.map_err(|err| format!("execute mysql statement failed: {err}"))?;
        MysqlSqlResult {
            columns: Vec::new(),
            rows: Vec::new(),
            affected_rows: conn.affected_rows(),
            last_insert_id: conn.last_insert_id(),
            message: "Statement executed".to_string(),
        }
    };
    save_history(&app_handle, &conn_id, database, trimmed)?;
    Ok(result)
}

#[tauri::command]
pub fn cmd_mysql_list_query_history(app_handle: tauri::AppHandle, connection_id: Option<String>, limit: Option<u32>) -> Result<Vec<MysqlQueryHistoryItem>, String> {
    let conn = open_db(&app_handle)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, connection_id, database_name, sql_text, executed_at
            FROM mysql_query_history
            WHERE ?1 IS NULL OR connection_id = ?1
            ORDER BY executed_at DESC
            LIMIT ?2
            "#,
        )
        .map_err(|err| format!("prepare mysql history query failed: {err}"))?;
    let rows = stmt
        .query_map(params![connection_id, limit.unwrap_or(50)], |row| {
            Ok(MysqlQueryHistoryItem {
                id: row.get(0)?,
                connection_id: row.get(1)?,
                database: row.get(2)?,
                sql: row.get(3)?,
                executed_at: row.get(4)?,
            })
        })
        .map_err(|err| format!("query mysql history failed: {err}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("parse mysql history failed: {err}"))
}

#[tauri::command]
pub async fn cmd_mysql_list_indexes(conn_id: String, database: String, table: String) -> Result<Vec<MysqlIndexInfo>, String> {
    let pool = super::client_pool::get_pool(&conn_id)?;
    let mut conn = pool.get_conn().await.map_err(|err| format!("mysql connect failed: {err}"))?;
    let sql = r#"
        SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE, INDEX_TYPE, CARDINALITY, SEQ_IN_INDEX
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY INDEX_NAME, SEQ_IN_INDEX
    "#;
    let rows: Vec<(String, String, u8, Option<String>, Option<u64>, u64)> = conn
        .exec(sql, (database.trim(), table.trim()))
        .await
        .map_err(|err| format!("list mysql indexes failed: {err}"))?;
    let mut grouped: BTreeMap<String, MysqlIndexInfo> = BTreeMap::new();
    for (name, column, non_unique, index_type, cardinality, _) in rows {
        let item = grouped.entry(name.clone()).or_insert(MysqlIndexInfo {
            name,
            columns: Vec::new(),
            unique: non_unique == 0,
            index_type,
            cardinality,
        });
        item.columns.push(column);
    }
    Ok(grouped.into_values().collect())
}

#[tauri::command]
pub async fn cmd_mysql_create_index(conn_id: String, database: String, table: String, index_name: String, columns: Vec<String>, unique: Option<bool>) -> Result<(), String> {
    if columns.is_empty() {
        return Err("at least one column is required".to_string());
    }
    let pool = super::client_pool::get_pool(&conn_id)?;
    let column_sql = columns.iter().map(|column| quote_ident(column)).collect::<Vec<_>>().join(", ");
    let sql = format!(
        "CREATE {} INDEX {} ON {}.{} ({column_sql})",
        if unique.unwrap_or(false) { "UNIQUE" } else { "" },
        quote_ident(index_name.trim()),
        quote_ident(database.trim()),
        quote_ident(table.trim())
    );
    let mut conn = pool.get_conn().await.map_err(|err| format!("mysql connect failed: {err}"))?;
    conn.query_drop(sql).await.map_err(|err| format!("create mysql index failed: {err}"))
}

#[tauri::command]
pub async fn cmd_mysql_drop_index(conn_id: String, database: String, table: String, index_name: String) -> Result<(), String> {
    if index_name == "PRIMARY" {
        return Err("dropping PRIMARY index is disabled".to_string());
    }
    let pool = super::client_pool::get_pool(&conn_id)?;
    let sql = format!("DROP INDEX {} ON {}.{}", quote_ident(index_name.trim()), quote_ident(database.trim()), quote_ident(table.trim()));
    let mut conn = pool.get_conn().await.map_err(|err| format!("mysql connect failed: {err}"))?;
    conn.query_drop(sql).await.map_err(|err| format!("drop mysql index failed: {err}"))
}

#[tauri::command]
pub async fn cmd_mysql_export_rows(app_handle: tauri::AppHandle, conn_id: String, database: String, table: String, format: Option<String>) -> Result<String, String> {
    let page = cmd_mysql_select_rows(conn_id, database, table, Some(0), Some(10_000)).await?;
    let export_dir = crate::db::init::data_dir(&app_handle)?.join("exports");
    fs::create_dir_all(&export_dir).map_err(|err| format!("create export dir failed: {err}"))?;
    let is_csv = format.as_deref() == Some("csv");
    let path = export_dir.join(format!(
        "mysql-export-{}.{}",
        chrono::Utc::now().format("%Y%m%d%H%M%S"),
        if is_csv { "csv" } else { "json" }
    ));
    if is_csv {
        let mut text = String::new();
        text.push_str(&page.columns.join(","));
        text.push('\n');
        for row in page.rows {
            let values = page.columns.iter().map(|column| {
                row.get(column).map(|value| value.to_string().replace(',', " ")).unwrap_or_default()
            }).collect::<Vec<_>>();
            text.push_str(&values.join(","));
            text.push('\n');
        }
        fs::write(&path, text).map_err(|err| format!("write mysql csv export failed: {err}"))?;
    } else {
        fs::write(&path, serde_json::to_string_pretty(&page.rows).map_err(|err| err.to_string())?)
            .map_err(|err| format!("write mysql json export failed: {err}"))?;
    }
    Ok(path.to_string_lossy().to_string())
}

fn import_rows_from_text(text: &str) -> Result<Vec<serde_json::Map<String, serde_json::Value>>, String> {
    let trimmed = text.trim();
    if trimmed.starts_with('[') {
        let values: Vec<serde_json::Value> = serde_json::from_str(trimmed).map_err(|err| format!("invalid json import file: {err}"))?;
        return values.into_iter().map(|value| match value {
            serde_json::Value::Object(map) => Ok(map),
            _ => Err("each import item must be an object".to_string()),
        }).collect();
    }
    let mut lines = trimmed.lines();
    let Some(header) = lines.next() else { return Ok(Vec::new()); };
    let columns: Vec<String> = header.split(',').map(|item| item.trim().to_string()).collect();
    let mut out = Vec::new();
    for line in lines.filter(|line| !line.trim().is_empty()) {
        let mut map = serde_json::Map::new();
        for (idx, value) in line.split(',').enumerate() {
            if let Some(column) = columns.get(idx) {
                map.insert(column.clone(), serde_json::Value::String(value.trim().to_string()));
            }
        }
        out.push(map);
    }
    Ok(out)
}

#[tauri::command]
pub fn cmd_mysql_preview_import_file(file_path: String, count: Option<u32>) -> Result<Vec<serde_json::Value>, String> {
    let text = fs::read_to_string(&file_path).map_err(|err| format!("read import file failed: {err}"))?;
    Ok(import_rows_from_text(&text)?.into_iter().take(count.unwrap_or(20) as usize).map(serde_json::Value::Object).collect())
}

#[tauri::command]
pub fn cmd_mysql_pick_import_file(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
    let import_dir = crate::db::init::data_dir(&app_handle)?.join("imports");
    fs::create_dir_all(&import_dir).map_err(|err| format!("create import dir failed: {err}"))?;
    let mut found: Option<PathBuf> = None;
    for entry in fs::read_dir(&import_dir).map_err(|err| format!("read import dir failed: {err}"))? {
        let path = entry.map_err(|err| format!("read import entry failed: {err}"))?.path();
        if path.extension().map(|ext| ext == "json" || ext == "csv").unwrap_or(false) {
            found = Some(path);
            break;
        }
    }
    Ok(found.map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn cmd_mysql_import_rows(conn_id: String, database: String, table: String, file_path: String, mode: Option<String>) -> Result<MysqlImportResult, String> {
    let text = fs::read_to_string(&file_path).map_err(|err| format!("read import file failed: {err}"))?;
    let rows = import_rows_from_text(&text)?;
    let mut success_count = 0;
    let mut failed_count = 0;
    let mut errors = Vec::new();
    for row in rows {
        let columns = row.keys().map(|key| quote_ident(key)).collect::<Vec<_>>().join(", ");
        let values = row.values().map(json_to_sql).collect::<Vec<_>>().join(", ");
        let verb = if mode.as_deref() == Some("replaceInto") { "REPLACE" } else { "INSERT" };
        let sql = format!("{verb} INTO {}.{} ({columns}) VALUES ({values})", quote_ident(database.trim()), quote_ident(table.trim()));
        let pool = super::client_pool::get_pool(&conn_id)?;
        match pool.get_conn().await {
            Ok(mut conn) => match conn.query_drop(sql).await {
                Ok(_) => success_count += 1,
                Err(err) => { failed_count += 1; errors.push(err.to_string()); }
            },
            Err(err) => { failed_count += 1; errors.push(err.to_string()); }
        }
    }
    Ok(MysqlImportResult { success_count, failed_count, errors })
}

#[tauri::command]
pub async fn cmd_mysql_get_server_status(conn_id: String) -> Result<MysqlServerStatus, String> {
    let pool = super::client_pool::get_pool(&conn_id)?;
    let mut conn = pool.get_conn().await.map_err(|err| format!("mysql connect failed: {err}"))?;
    let version: Option<String> = conn.query_first("SELECT VERSION()").await.ok().flatten();
    let rows: Vec<(String, String)> = conn
        .query("SHOW GLOBAL STATUS WHERE Variable_name IN ('Uptime','Threads_connected','Threads_running','Connections','Queries','Questions','Slow_queries')")
        .await
        .map_err(|err| format!("get mysql status failed: {err}"))?;
    let status: HashMap<String, String> = rows.into_iter().collect();
    Ok(MysqlServerStatus { version, status })
}
