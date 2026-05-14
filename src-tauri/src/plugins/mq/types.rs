#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MqConnectionInfo {
    pub id: String,
    pub name: String,
    pub group_name: Option<String>,
    pub broker_type: String,
    pub hosts: Vec<String>,
    pub username: Option<String>,
    pub connect_timeout: u64,
    pub rabbitmq: Option<RabbitMqConfig>,
    pub kafka: Option<KafkaConfig>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MqConnectionForm {
    pub id: Option<String>,
    pub name: String,
    pub group_name: Option<String>,
    pub broker_type: String,
    pub hosts: Vec<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub connect_timeout: Option<u64>,
    pub rabbitmq: Option<RabbitMqConfig>,
    pub kafka: Option<KafkaConfig>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RabbitMqConfig {
    pub amqp_url: Option<String>,
    pub virtual_host: Option<String>,
    pub management_url: Option<String>,
    pub management_username: Option<String>,
    pub management_password: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KafkaConfig {
    pub bootstrap_servers: Option<Vec<String>>,
    pub client_id: Option<String>,
    pub security_protocol: Option<String>,
    pub sasl_mechanism: Option<String>,
    pub sasl_username: Option<String>,
    pub sasl_password: Option<String>,
    pub tls_enabled: Option<bool>,
}

#[derive(Debug, Clone)]
pub struct MqConnectionSecret {
    pub password: Option<String>,
    pub rabbitmq_management_password: Option<String>,
    pub kafka_sasl_password: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MqConnectionDiagnostics {
    pub broker_type: String,
    pub success: bool,
    pub stages: Vec<MqDiagnosticStage>,
    pub summary: String,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MqDiagnosticStage {
    pub name: String,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MqKeyValue {
    pub key: String,
    pub value: String,
    pub enabled: bool,
    pub secret: Option<bool>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncodedMessageBody {
    pub encoding: String,
    pub text: String,
    pub content_type: Option<String>,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MqPublishRequest {
    pub conn_id: String,
    pub broker_type: String,
    pub target: String,
    pub routing_key: Option<String>,
    pub key: Option<String>,
    pub partition: Option<i32>,
    pub headers: Vec<MqKeyValue>,
    pub properties: Vec<MqKeyValue>,
    pub body: EncodedMessageBody,
    pub save_history: Option<bool>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MqConsumeRequest {
    pub conn_id: String,
    pub broker_type: String,
    pub target: String,
    pub partition: Option<i32>,
    pub offset_mode: Option<String>,
    pub offset: Option<i64>,
    pub limit: Option<u32>,
    pub timeout_ms: Option<u64>,
    pub ack_mode: Option<String>,
    pub save_history: Option<bool>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MqOperationResult {
    pub status: String,
    pub summary: String,
    pub duration_ms: u64,
    pub messages: Vec<MqMessagePreview>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MqMessagePreview {
    pub target: String,
    pub key: Option<EncodedMessageBody>,
    pub body: EncodedMessageBody,
    pub headers: Vec<MqKeyValue>,
    pub properties: Vec<MqKeyValue>,
    pub partition: Option<i32>,
    pub offset: Option<i64>,
    pub timestamp: Option<String>,
    pub redelivered: Option<bool>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MqResourceNode {
    pub key: String,
    pub title: String,
    pub node_type: String,
    pub broker_type: String,
    pub metadata: serde_json::Value,
    pub children: Vec<MqResourceNode>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MqHistoryItem {
    pub id: String,
    pub broker_type: String,
    pub connection_id: String,
    pub operation_type: String,
    pub target: String,
    pub status: String,
    pub duration_ms: u64,
    pub request_json: String,
    pub result_json: String,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MqHistoryFilter {
    pub broker_type: Option<String>,
    pub connection_id: Option<String>,
    pub target: Option<String>,
    pub operation_type: Option<String>,
    pub status: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MqSavedMessage {
    pub id: String,
    pub broker_type: String,
    pub name: String,
    pub target: Option<String>,
    pub body: EncodedMessageBody,
    pub headers: Vec<MqKeyValue>,
    pub properties: Vec<MqKeyValue>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MqSavedMessageForm {
    pub id: Option<String>,
    pub broker_type: String,
    pub name: String,
    pub target: Option<String>,
    pub body: EncodedMessageBody,
    pub headers: Vec<MqKeyValue>,
    pub properties: Vec<MqKeyValue>,
}
