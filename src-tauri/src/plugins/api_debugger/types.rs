#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyValue {
    pub key: String,
    pub value: String,
    pub enabled: bool,
    pub secret: Option<bool>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiAuthConfig {
    pub auth_type: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub token: Option<String>,
    pub key: Option<String>,
    pub value: Option<String>,
    pub add_to: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiBodyConfig {
    pub body_type: String,
    pub raw: Option<String>,
    pub form: Option<Vec<ApiKeyValue>>,
    pub multipart: Option<Vec<ApiKeyValue>>,
    pub binary_path: Option<String>,
    pub content_type: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiSendRequest {
    pub request_id: Option<String>,
    pub method: String,
    pub url: String,
    pub params: Vec<ApiKeyValue>,
    pub headers: Vec<ApiKeyValue>,
    pub cookies: Vec<ApiKeyValue>,
    pub auth: Option<ApiAuthConfig>,
    pub body: Option<ApiBodyConfig>,
    pub timeout_ms: Option<u64>,
    pub follow_redirects: Option<bool>,
    pub validate_ssl: Option<bool>,
    pub environment_id: Option<String>,
    pub save_history: Option<bool>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResolvedPreview {
    pub url: String,
    pub headers: Vec<ApiKeyValue>,
    pub cookies: Vec<ApiKeyValue>,
    pub body_preview: Option<String>,
    pub missing_variables: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiTimingInfo {
    pub total_ms: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponseData {
    pub status: Option<u16>,
    pub status_text: Option<String>,
    pub duration_ms: u64,
    pub size_bytes: u64,
    pub headers: Vec<ApiKeyValue>,
    pub cookies: Vec<ApiKeyValue>,
    pub body: String,
    pub body_truncated: bool,
    pub content_type: Option<String>,
    pub redirect_chain: Vec<String>,
    pub error: Option<String>,
    pub timing: ApiTimingInfo,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiCollection {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiFolder {
    pub id: String,
    pub collection_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiSavedRequest {
    pub id: String,
    pub collection_id: Option<String>,
    pub folder_id: Option<String>,
    pub name: String,
    pub method: String,
    pub url: String,
    pub params_json: String,
    pub headers_json: String,
    pub cookies_json: String,
    pub auth_json: String,
    pub body_json: String,
    pub timeout_ms: u64,
    pub follow_redirects: bool,
    pub validate_ssl: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiSaveRequestForm {
    pub id: Option<String>,
    pub collection_id: Option<String>,
    pub folder_id: Option<String>,
    pub name: String,
    pub request: ApiSendRequest,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiEnvironment {
    pub id: String,
    pub name: String,
    pub variables: Vec<ApiKeyValue>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiHistoryItem {
    pub id: String,
    pub method: String,
    pub url: String,
    pub host: String,
    pub status: String,
    pub status_code: Option<u16>,
    pub duration_ms: u64,
    pub request_json: String,
    pub response_json: String,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiHistoryFilter {
    pub method: Option<String>,
    pub host: Option<String>,
    pub status: Option<String>,
    pub limit: Option<u32>,
}
