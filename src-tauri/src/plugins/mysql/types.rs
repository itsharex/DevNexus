use std::collections::HashMap;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MysqlLatency {
    pub millis: u64,
    pub server_version: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MysqlDatabaseInfo {
    pub name: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MysqlTableInfo {
    pub name: String,
    pub table_type: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MysqlColumnInfo {
    pub name: String,
    pub column_type: String,
    pub nullable: bool,
    pub key: String,
    pub default_value: Option<String>,
    pub extra: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MysqlTableStatus {
    pub name: String,
    pub engine: Option<String>,
    pub rows: Option<u64>,
    pub data_length: Option<u64>,
    pub index_length: Option<u64>,
    pub collation: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MysqlRowPage {
    pub columns: Vec<String>,
    pub rows: Vec<serde_json::Value>,
    pub total: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MysqlSqlResult {
    pub columns: Vec<String>,
    pub rows: Vec<serde_json::Value>,
    pub affected_rows: u64,
    pub last_insert_id: Option<u64>,
    pub message: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MysqlIndexInfo {
    pub name: String,
    pub columns: Vec<String>,
    pub unique: bool,
    pub index_type: Option<String>,
    pub cardinality: Option<u64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MysqlQueryHistoryItem {
    pub id: String,
    pub connection_id: String,
    pub database: Option<String>,
    pub sql: String,
    pub executed_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MysqlImportResult {
    pub success_count: u64,
    pub failed_count: u64,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MysqlServerStatus {
    pub version: Option<String>,
    pub status: HashMap<String, String>,
}
