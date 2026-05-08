use std::collections::HashMap;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoLatency {
    pub millis: u64,
    pub server_version: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoDatabaseInfo {
    pub name: String,
    pub size_on_disk: u64,
    pub empty: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoCollectionInfo {
    pub name: String,
    pub collection_type: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoCollectionStats {
    pub count: i64,
    pub size: i64,
    pub storage_size: i64,
    pub total_index_size: i64,
    pub avg_obj_size: Option<f64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoDocumentPage {
    pub documents: Vec<String>,
    pub total: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoIndexInfo {
    pub name: String,
    pub keys_json: String,
    pub unique: bool,
    pub sparse: bool,
    pub expire_after_seconds: Option<i64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoQueryHistoryItem {
    pub id: String,
    pub connection_id: String,
    pub database: Option<String>,
    pub collection: Option<String>,
    pub query_type: String,
    pub content: String,
    pub executed_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoImportResult {
    pub success_count: u64,
    pub failed_count: u64,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoServerStatus {
    pub version: Option<String>,
    pub connections: HashMap<String, String>,
    pub memory: HashMap<String, String>,
    pub opcounters: HashMap<String, String>,
}
