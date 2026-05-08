use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use std::time::Instant;

use futures_util::TryStreamExt;
use mongodb::bson::{doc, to_bson, Bson, Document};
use mongodb::options::{FindOptions, IndexOptions};
use mongodb::{Client, IndexModel};
use rusqlite::{params, Connection};

use crate::db::mongodb_connection_repo::{self, MongoConnectionForm, MongoConnectionInfo};

use super::types::{
    MongoCollectionInfo, MongoCollectionStats, MongoDatabaseInfo, MongoDocumentPage,
    MongoImportResult, MongoIndexInfo, MongoLatency, MongoQueryHistoryItem, MongoServerStatus,
};

fn open_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let path = crate::db::init::db_path(app_handle)?;
    Connection::open(path).map_err(|err| format!("failed to open db: {err}"))
}

fn document_from_json(input: Option<String>) -> Result<Document, String> {
    let Some(input) = input else {
        return Ok(Document::new());
    };
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok(Document::new());
    }
    let value: serde_json::Value =
        serde_json::from_str(trimmed).map_err(|err| format!("invalid json document: {err}"))?;
    match to_bson(&value).map_err(|err| format!("json to bson failed: {err}"))? {
        Bson::Document(doc) => Ok(doc),
        _ => Err("json value must be an object".to_string()),
    }
}

fn documents_from_json(input: &str) -> Result<Vec<Document>, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    if trimmed.starts_with('[') {
        let values: Vec<serde_json::Value> =
            serde_json::from_str(trimmed).map_err(|err| format!("invalid json array: {err}"))?;
        return values
            .into_iter()
            .map(|value| {
                match to_bson(&value).map_err(|err| format!("json to bson failed: {err}"))? {
                    Bson::Document(doc) => Ok(doc),
                    _ => Err("each json array item must be an object".to_string()),
                }
            })
            .collect();
    }
    trimmed
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| document_from_json(Some(line.to_string())))
        .collect()
}

fn document_to_json(document: &Document) -> Result<String, String> {
    serde_json::to_string_pretty(document).map_err(|err| format!("bson to json failed: {err}"))
}

fn get_i64(doc: &Document, key: &str) -> i64 {
    match doc.get(key) {
        Some(Bson::Int32(value)) => *value as i64,
        Some(Bson::Int64(value)) => *value,
        Some(Bson::Double(value)) => *value as i64,
        _ => 0,
    }
}

fn get_f64(doc: &Document, key: &str) -> Option<f64> {
    match doc.get(key) {
        Some(Bson::Int32(value)) => Some(*value as f64),
        Some(Bson::Int64(value)) => Some(*value as f64),
        Some(Bson::Double(value)) => Some(*value),
        _ => None,
    }
}

async fn client_from_form(form: MongoConnectionForm) -> Result<Client, String> {
    let temp_config = MongoConnectionInfo {
        id: "__temp__".to_string(),
        name: form.name.clone(),
        group_name: form.group_name.clone(),
        mode: form.mode.clone(),
        host: form.host.clone(),
        port: form.port.unwrap_or(27017),
        username: form.username.clone(),
        auth_database: form.auth_database.clone(),
        default_database: form.default_database.clone(),
        replica_set: form.replica_set.clone(),
        tls: form.tls.unwrap_or(false),
        srv: form.srv.unwrap_or(false),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let secret = mongodb_connection_repo::MongoConnectionSecret {
        uri: form.uri,
        password: form.password,
    };
    super::client_pool::build_client(&temp_config, Some(secret)).await
}

async fn ping_client(client: &Client) -> Result<Option<String>, String> {
    client
        .database("admin")
        .run_command(doc! { "ping": 1 })
        .await
        .map_err(|err| format!("mongodb ping failed: {err}"))?;
    let build_info = client
        .database("admin")
        .run_command(doc! { "buildInfo": 1 })
        .await
        .ok();
    Ok(build_info.and_then(|doc| doc.get_str("version").ok().map(ToString::to_string)))
}

#[tauri::command]
pub fn cmd_mongo_list_connections(
    app_handle: tauri::AppHandle,
) -> Result<Vec<MongoConnectionInfo>, String> {
    mongodb_connection_repo::list_mongo_connections(&app_handle)
}

#[tauri::command]
pub fn cmd_mongo_save_connection(
    app_handle: tauri::AppHandle,
    form: MongoConnectionForm,
) -> Result<String, String> {
    mongodb_connection_repo::save_mongo_connection(&app_handle, form)
}

#[tauri::command]
pub fn cmd_mongo_delete_connection(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    super::client_pool::remove_client(&id)?;
    mongodb_connection_repo::delete_mongo_connection(&app_handle, &id)
}

#[tauri::command]
pub async fn cmd_mongo_test_connection(form: MongoConnectionForm) -> Result<MongoLatency, String> {
    let started = Instant::now();
    let client = client_from_form(form).await?;
    let server_version = ping_client(&client).await?;
    Ok(MongoLatency {
        millis: started.elapsed().as_millis() as u64,
        server_version,
    })
}

#[tauri::command]
pub async fn cmd_mongo_connect(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    let config = mongodb_connection_repo::get_mongo_connection(&app_handle, &id)?
        .ok_or_else(|| format!("mongodb connection `{id}` not found"))?;
    let secret = mongodb_connection_repo::get_mongo_secret(&app_handle, &id)?;
    let client = super::client_pool::build_client(&config, secret).await?;
    ping_client(&client).await?;
    super::client_pool::put_client(&id, client)
}

#[tauri::command]
pub fn cmd_mongo_disconnect(id: String) -> Result<(), String> {
    super::client_pool::remove_client(&id)
}

#[tauri::command]
pub async fn cmd_mongo_list_databases(conn_id: String) -> Result<Vec<MongoDatabaseInfo>, String> {
    let client = super::client_pool::get_client(&conn_id)?;
    let names = client
        .list_database_names()
        .await
        .map_err(|err| format!("list mongodb databases failed: {err}"))?;
    let mut out = Vec::new();
    for name in names {
        let stats = client
            .database(&name)
            .run_command(doc! { "dbStats": 1 })
            .await
            .unwrap_or_default();
        out.push(MongoDatabaseInfo {
            name,
            size_on_disk: get_i64(&stats, "storageSize").max(0) as u64,
            empty: get_i64(&stats, "collections") == 0,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn cmd_mongo_list_collections(
    conn_id: String,
    database: String,
) -> Result<Vec<MongoCollectionInfo>, String> {
    let client = super::client_pool::get_client(&conn_id)?;
    let names = client
        .database(database.trim())
        .list_collection_names()
        .await
        .map_err(|err| format!("list mongodb collections failed: {err}"))?;
    Ok(names
        .into_iter()
        .map(|name| MongoCollectionInfo {
            name,
            collection_type: "collection".to_string(),
        })
        .collect())
}

#[tauri::command]
pub async fn cmd_mongo_get_collection_stats(
    conn_id: String,
    database: String,
    collection: String,
) -> Result<MongoCollectionStats, String> {
    let client = super::client_pool::get_client(&conn_id)?;
    let stats = client
        .database(database.trim())
        .run_command(doc! { "collStats": collection.trim() })
        .await
        .map_err(|err| format!("get mongodb collection stats failed: {err}"))?;
    Ok(MongoCollectionStats {
        count: get_i64(&stats, "count"),
        size: get_i64(&stats, "size"),
        storage_size: get_i64(&stats, "storageSize"),
        total_index_size: get_i64(&stats, "totalIndexSize"),
        avg_obj_size: get_f64(&stats, "avgObjSize"),
    })
}

#[tauri::command]
pub async fn cmd_mongo_create_collection(
    conn_id: String,
    database: String,
    collection: String,
) -> Result<(), String> {
    let client = super::client_pool::get_client(&conn_id)?;
    client
        .database(database.trim())
        .create_collection(collection.trim())
        .await
        .map_err(|err| format!("create mongodb collection failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_mongo_drop_collection(
    conn_id: String,
    database: String,
    collection: String,
) -> Result<(), String> {
    let client = super::client_pool::get_client(&conn_id)?;
    client
        .database(database.trim())
        .collection::<Document>(collection.trim())
        .drop()
        .await
        .map_err(|err| format!("drop mongodb collection failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_mongo_find_documents(
    conn_id: String,
    database: String,
    collection: String,
    filter_json: Option<String>,
    projection_json: Option<String>,
    sort_json: Option<String>,
    skip: Option<u64>,
    limit: Option<i64>,
) -> Result<MongoDocumentPage, String> {
    let client = super::client_pool::get_client(&conn_id)?;
    let coll = client
        .database(database.trim())
        .collection::<Document>(collection.trim());
    let filter = document_from_json(filter_json)?;
    let mut options = FindOptions::default();
    options.projection = Some(document_from_json(projection_json)?).filter(|doc| !doc.is_empty());
    options.sort = Some(document_from_json(sort_json)?).filter(|doc| !doc.is_empty());
    options.skip = skip;
    options.limit = limit.or(Some(50));

    let total = coll
        .count_documents(filter.clone())
        .await
        .map_err(|err| format!("count mongodb documents failed: {err}"))?;
    let mut cursor = coll
        .find(filter)
        .with_options(options)
        .await
        .map_err(|err| format!("find mongodb documents failed: {err}"))?;
    let mut documents = Vec::new();
    while let Some(doc) = cursor
        .try_next()
        .await
        .map_err(|err| format!("read mongodb document failed: {err}"))?
    {
        documents.push(document_to_json(&doc)?);
    }
    Ok(MongoDocumentPage { documents, total })
}

#[tauri::command]
pub async fn cmd_mongo_insert_document(
    conn_id: String,
    database: String,
    collection: String,
    document_json: String,
) -> Result<String, String> {
    let client = super::client_pool::get_client(&conn_id)?;
    let doc = document_from_json(Some(document_json))?;
    let result = client
        .database(database.trim())
        .collection::<Document>(collection.trim())
        .insert_one(doc)
        .await
        .map_err(|err| format!("insert mongodb document failed: {err}"))?;
    serde_json::to_string(&result.inserted_id)
        .map_err(|err| format!("serialize inserted id failed: {err}"))
}

#[tauri::command]
pub async fn cmd_mongo_update_document(
    conn_id: String,
    database: String,
    collection: String,
    id_json: String,
    document_json: String,
) -> Result<u64, String> {
    let client = super::client_pool::get_client(&conn_id)?;
    let id_doc = document_from_json(Some(id_json))?;
    let id = id_doc
        .get("_id")
        .cloned()
        .ok_or_else(|| "id_json must contain _id".to_string())?;
    let mut replacement = document_from_json(Some(document_json))?;
    replacement.remove("_id");
    let result = client
        .database(database.trim())
        .collection::<Document>(collection.trim())
        .replace_one(doc! { "_id": id }, replacement)
        .await
        .map_err(|err| format!("update mongodb document failed: {err}"))?;
    Ok(result.modified_count)
}

#[tauri::command]
pub async fn cmd_mongo_delete_documents(
    conn_id: String,
    database: String,
    collection: String,
    filter_json: String,
) -> Result<u64, String> {
    let filter = document_from_json(Some(filter_json))?;
    if filter.is_empty() {
        return Err("empty delete filter is not allowed".to_string());
    }
    let client = super::client_pool::get_client(&conn_id)?;
    let result = client
        .database(database.trim())
        .collection::<Document>(collection.trim())
        .delete_many(filter)
        .await
        .map_err(|err| format!("delete mongodb documents failed: {err}"))?;
    Ok(result.deleted_count)
}

fn save_history(
    app_handle: &tauri::AppHandle,
    connection_id: &str,
    database: Option<String>,
    collection: Option<String>,
    query_type: &str,
    content: &str,
) -> Result<(), String> {
    let conn = open_db(app_handle)?;
    conn.execute(
        r#"
        INSERT INTO mongodb_query_history
          (id, connection_id, database_name, collection_name, query_type, content, executed_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        "#,
        params![
            uuid::Uuid::new_v4().to_string(),
            connection_id,
            database,
            collection,
            query_type,
            content,
            chrono::Utc::now().to_rfc3339()
        ],
    )
    .map_err(|err| format!("save mongodb query history failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub fn cmd_mongo_list_query_history(
    app_handle: tauri::AppHandle,
    connection_id: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<MongoQueryHistoryItem>, String> {
    let conn = open_db(&app_handle)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, connection_id, database_name, collection_name, query_type, content, executed_at
            FROM mongodb_query_history
            WHERE ?1 IS NULL OR connection_id = ?1
            ORDER BY executed_at DESC
            LIMIT ?2
            "#,
        )
        .map_err(|err| format!("prepare mongodb history query failed: {err}"))?;
    let rows = stmt
        .query_map(params![connection_id, limit.unwrap_or(50)], |row| {
            Ok(MongoQueryHistoryItem {
                id: row.get(0)?,
                connection_id: row.get(1)?,
                database: row.get(2)?,
                collection: row.get(3)?,
                query_type: row.get(4)?,
                content: row.get(5)?,
                executed_at: row.get(6)?,
            })
        })
        .map_err(|err| format!("query mongodb history failed: {err}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("parse mongodb history failed: {err}"))
}

#[tauri::command]
pub async fn cmd_mongo_run_find_query(
    app_handle: tauri::AppHandle,
    conn_id: String,
    database: String,
    collection: String,
    filter_json: Option<String>,
    projection_json: Option<String>,
    sort_json: Option<String>,
    skip: Option<u64>,
    limit: Option<i64>,
) -> Result<MongoDocumentPage, String> {
    let content = serde_json::json!({
        "filter": filter_json,
        "projection": projection_json,
        "sort": sort_json,
        "skip": skip,
        "limit": limit,
    })
    .to_string();
    let page = cmd_mongo_find_documents(
        conn_id.clone(),
        database.clone(),
        collection.clone(),
        filter_json,
        projection_json,
        sort_json,
        skip,
        limit,
    )
    .await?;
    save_history(
        &app_handle,
        &conn_id,
        Some(database),
        Some(collection),
        "find",
        &content,
    )?;
    Ok(page)
}

#[tauri::command]
pub async fn cmd_mongo_run_aggregate(
    app_handle: tauri::AppHandle,
    conn_id: String,
    database: String,
    collection: String,
    pipeline_json: String,
) -> Result<Vec<String>, String> {
    let values: Vec<serde_json::Value> = serde_json::from_str(&pipeline_json)
        .map_err(|err| format!("invalid pipeline json: {err}"))?;
    let mut pipeline = Vec::new();
    for value in values {
        match to_bson(&value).map_err(|err| format!("json to bson failed: {err}"))? {
            Bson::Document(doc) => pipeline.push(doc),
            _ => return Err("pipeline entries must be objects".to_string()),
        }
    }
    let client = super::client_pool::get_client(&conn_id)?;
    let mut cursor = client
        .database(database.trim())
        .collection::<Document>(collection.trim())
        .aggregate(pipeline)
        .await
        .map_err(|err| format!("run mongodb aggregate failed: {err}"))?;
    let mut out = Vec::new();
    while let Some(doc) = cursor
        .try_next()
        .await
        .map_err(|err| format!("read aggregate result failed: {err}"))?
    {
        out.push(document_to_json(&doc)?);
    }
    save_history(
        &app_handle,
        &conn_id,
        Some(database),
        Some(collection),
        "aggregate",
        &pipeline_json,
    )?;
    Ok(out)
}

#[tauri::command]
pub async fn cmd_mongo_run_database_command(
    app_handle: tauri::AppHandle,
    conn_id: String,
    database: String,
    command_json: String,
) -> Result<String, String> {
    let command = document_from_json(Some(command_json.clone()))?;
    let client = super::client_pool::get_client(&conn_id)?;
    let result = client
        .database(database.trim())
        .run_command(command)
        .await
        .map_err(|err| format!("run mongodb command failed: {err}"))?;
    save_history(
        &app_handle,
        &conn_id,
        Some(database),
        None,
        "command",
        &command_json,
    )?;
    document_to_json(&result)
}

#[tauri::command]
pub async fn cmd_mongo_list_indexes(
    conn_id: String,
    database: String,
    collection: String,
) -> Result<Vec<MongoIndexInfo>, String> {
    let client = super::client_pool::get_client(&conn_id)?;
    let mut cursor = client
        .database(database.trim())
        .collection::<Document>(collection.trim())
        .list_indexes()
        .await
        .map_err(|err| format!("list mongodb indexes failed: {err}"))?;
    let mut out = Vec::new();
    while let Some(index) = cursor
        .try_next()
        .await
        .map_err(|err| format!("read mongodb index failed: {err}"))?
    {
        let options = index.options.unwrap_or_default();
        out.push(MongoIndexInfo {
            name: options.name.unwrap_or_else(|| "unnamed".to_string()),
            keys_json: document_to_json(&index.keys)?,
            unique: options.unique.unwrap_or(false),
            sparse: options.sparse.unwrap_or(false),
            expire_after_seconds: options
                .expire_after
                .map(|duration| duration.as_secs() as i64),
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn cmd_mongo_create_index(
    conn_id: String,
    database: String,
    collection: String,
    keys_json: String,
    options_json: Option<String>,
) -> Result<String, String> {
    let keys = document_from_json(Some(keys_json))?;
    let options_doc = document_from_json(options_json)?;
    let mut options = IndexOptions::default();
    if let Ok(name) = options_doc.get_str("name") {
        options.name = Some(name.to_string());
    }
    if let Ok(unique) = options_doc.get_bool("unique") {
        options.unique = Some(unique);
    }
    if let Ok(sparse) = options_doc.get_bool("sparse") {
        options.sparse = Some(sparse);
    }
    if let Some(seconds) = get_f64(&options_doc, "expireAfterSeconds") {
        options.expire_after = Some(Duration::from_secs(seconds.max(0.0) as u64));
    }
    let model = IndexModel::builder().keys(keys).options(options).build();
    let result = client_collection(&conn_id, &database, &collection)?
        .create_index(model)
        .await
        .map_err(|err| format!("create mongodb index failed: {err}"))?;
    Ok(result.index_name)
}

fn client_collection(
    conn_id: &str,
    database: &str,
    collection: &str,
) -> Result<mongodb::Collection<Document>, String> {
    let client = super::client_pool::get_client(conn_id)?;
    Ok(client
        .database(database.trim())
        .collection::<Document>(collection.trim()))
}

#[tauri::command]
pub async fn cmd_mongo_drop_index(
    conn_id: String,
    database: String,
    collection: String,
    index_name: String,
) -> Result<(), String> {
    client_collection(&conn_id, &database, &collection)?
        .drop_index(index_name.trim())
        .await
        .map_err(|err| format!("drop mongodb index failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_mongo_export_documents(
    app_handle: tauri::AppHandle,
    conn_id: String,
    database: String,
    collection: String,
    filter_json: Option<String>,
    format: Option<String>,
) -> Result<String, String> {
    let page = cmd_mongo_find_documents(
        conn_id,
        database,
        collection,
        filter_json,
        None,
        None,
        Some(0),
        Some(10_000),
    )
    .await?;
    let export_dir = crate::db::init::data_dir(&app_handle)?.join("exports");
    fs::create_dir_all(&export_dir).map_err(|err| format!("create export dir failed: {err}"))?;
    let is_jsonl = format.as_deref() == Some("jsonl");
    let path = export_dir.join(format!(
        "mongodb-export-{}.{}",
        chrono::Utc::now().format("%Y%m%d%H%M%S"),
        if is_jsonl { "jsonl" } else { "json" }
    ));
    if is_jsonl {
        fs::write(&path, page.documents.join("\n"))
            .map_err(|err| format!("write mongodb jsonl export failed: {err}"))?;
    } else {
        fs::write(&path, format!("[\n{}\n]", page.documents.join(",\n")))
            .map_err(|err| format!("write mongodb json export failed: {err}"))?;
    }
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn cmd_mongo_preview_import_file(
    file_path: String,
    count: Option<u32>,
) -> Result<Vec<String>, String> {
    let text =
        fs::read_to_string(&file_path).map_err(|err| format!("read import file failed: {err}"))?;
    let docs = documents_from_json(&text)?;
    docs.into_iter()
        .take(count.unwrap_or(20) as usize)
        .map(|doc| document_to_json(&doc))
        .collect()
}

#[tauri::command]
pub fn cmd_mongo_pick_import_file(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
    let import_dir = crate::db::init::data_dir(&app_handle)?.join("imports");
    fs::create_dir_all(&import_dir).map_err(|err| format!("create import dir failed: {err}"))?;
    let mut found: Option<PathBuf> = None;
    for entry in
        fs::read_dir(&import_dir).map_err(|err| format!("read import dir failed: {err}"))?
    {
        let path = entry
            .map_err(|err| format!("read import entry failed: {err}"))?
            .path();
        if path
            .extension()
            .map(|ext| ext == "json" || ext == "jsonl")
            .unwrap_or(false)
        {
            found = Some(path);
            break;
        }
    }
    Ok(found.map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn cmd_mongo_import_documents(
    conn_id: String,
    database: String,
    collection: String,
    file_path: String,
    mode: Option<String>,
) -> Result<MongoImportResult, String> {
    let text =
        fs::read_to_string(&file_path).map_err(|err| format!("read import file failed: {err}"))?;
    let docs = documents_from_json(&text)?;
    let coll = client_collection(&conn_id, &database, &collection)?;
    let mut success_count = 0;
    let mut failed_count = 0;
    let mut errors = Vec::new();
    let mode = mode.unwrap_or_else(|| "insertOnly".to_string());
    for doc in docs {
        let result = if mode == "replaceById" || mode == "upsertById" {
            if let Some(id) = doc.get("_id").cloned() {
                let mut replacement = doc.clone();
                replacement.remove("_id");
                coll.replace_one(doc! { "_id": id }, replacement)
                    .upsert(mode == "upsertById")
                    .await
                    .map(|_| ())
            } else {
                coll.insert_one(doc).await.map(|_| ())
            }
        } else {
            coll.insert_one(doc).await.map(|_| ())
        };
        match result {
            Ok(_) => success_count += 1,
            Err(err) => {
                failed_count += 1;
                errors.push(err.to_string());
            }
        }
    }
    Ok(MongoImportResult {
        success_count,
        failed_count,
        errors,
    })
}

#[tauri::command]
pub async fn cmd_mongo_get_server_status(conn_id: String) -> Result<MongoServerStatus, String> {
    let client = super::client_pool::get_client(&conn_id)?;
    let admin = client.database("admin");
    let status = admin
        .run_command(doc! { "serverStatus": 1 })
        .await
        .map_err(|err| format!("get mongodb server status failed: {err}"))?;
    let build = admin.run_command(doc! { "buildInfo": 1 }).await.ok();
    Ok(MongoServerStatus {
        version: build.and_then(|doc| doc.get_str("version").ok().map(ToString::to_string)),
        connections: status
            .get_document("connections")
            .map(map_document_strings)
            .unwrap_or_default(),
        memory: status
            .get_document("mem")
            .map(map_document_strings)
            .unwrap_or_default(),
        opcounters: status
            .get_document("opcounters")
            .map(map_document_strings)
            .unwrap_or_default(),
    })
}

fn map_document_strings(doc: &Document) -> std::collections::HashMap<String, String> {
    doc.iter()
        .map(|(key, value)| (key.clone(), value.to_string()))
        .collect()
}
