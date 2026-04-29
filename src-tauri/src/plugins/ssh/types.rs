#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshLatency {
    pub millis: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshTerminalSessionInfo {
    pub session_id: String,
    pub conn_id: String,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshKeyInfo {
    pub id: String,
    pub name: String,
    pub key_type: String,
    pub private_key_path: String,
    pub public_key: String,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshGeneratedKeyPair {
    pub key_type: String,
    pub private_key_pem: String,
    pub public_key: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshQuickCommand {
    pub id: String,
    pub connection_id: Option<String>,
    pub name: String,
    pub command: String,
    pub sort_order: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshQuickCommandForm {
    pub id: Option<String>,
    pub connection_id: Option<String>,
    pub name: String,
    pub command: String,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelRule {
    pub id: String,
    pub connection_id: String,
    pub name: String,
    pub tunnel_type: String,
    pub local_host: Option<String>,
    pub local_port: Option<u16>,
    pub remote_host: Option<String>,
    pub remote_port: Option<u16>,
    pub auto_start: bool,
    pub status: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelRuleForm {
    pub id: Option<String>,
    pub connection_id: String,
    pub name: String,
    pub tunnel_type: String,
    pub local_host: Option<String>,
    pub local_port: Option<u16>,
    pub remote_host: Option<String>,
    pub remote_port: Option<u16>,
    pub auto_start: Option<bool>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelStartForm {
    pub rule_id: String,
    pub connection_id: String,
    pub local_host: Option<String>,
    pub local_port: Option<u16>,
    pub remote_host: Option<String>,
    pub remote_port: Option<u16>,
}
