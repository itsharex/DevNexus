#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkHistoryItem {
    pub id: String,
    pub tool_type: String,
    pub target: String,
    pub params_json: String,
    pub status: String,
    pub duration_ms: u64,
    pub summary: String,
    pub result_json: String,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TcpCheckResult {
    pub connected: bool,
    pub host: String,
    pub port: u16,
    pub duration_ms: u64,
    pub remote_addr: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PingResult {
    pub target: String,
    pub transmitted: Option<u32>,
    pub received: Option<u32>,
    pub loss_percent: Option<f64>,
    pub avg_ms: Option<f64>,
    pub duration_ms: u64,
    pub raw_output: String,
    pub success: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsLookupResult {
    pub host: String,
    pub record_type: String,
    pub addresses: Vec<String>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceHop {
    pub hop: u32,
    pub address: Option<String>,
    pub raw_line: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TracerouteResult {
    pub target: String,
    pub hops: Vec<TraceHop>,
    pub duration_ms: u64,
    pub raw_output: String,
    pub success: bool,
}
