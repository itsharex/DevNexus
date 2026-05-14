use std::time::{Duration, Instant};

use rdkafka::config::ClientConfig;
use rdkafka::consumer::{BaseConsumer, Consumer};
use rdkafka::message::{Headers, Message};
use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::TopicPartitionList;

use super::types::{
    MqConnectionDiagnostics, MqConnectionInfo, MqConsumeRequest, MqDiagnosticStage, MqKeyValue,
    MqMessagePreview, MqOperationResult, MqPublishRequest, MqResourceNode,
};
use super::utils::{decode_body, encode_bytes};

fn kafka_config(conn: &MqConnectionInfo) -> ClientConfig {
    let mut config = ClientConfig::new();
    let bootstrap = conn
        .kafka
        .as_ref()
        .and_then(|item| item.bootstrap_servers.clone())
        .unwrap_or_else(|| conn.hosts.clone())
        .join(",");
    config.set("bootstrap.servers", bootstrap);
    config.set("client.id", conn.kafka.as_ref().and_then(|item| item.client_id.clone()).unwrap_or_else(|| "devnexus-mq".into()));
    config.set("enable.auto.commit", "false");
    config.set("session.timeout.ms", "6000");
    if let Some(kafka) = &conn.kafka {
        if let Some(protocol) = &kafka.security_protocol {
            config.set("security.protocol", protocol);
        }
        if let Some(mechanism) = &kafka.sasl_mechanism {
            config.set("sasl.mechanisms", mechanism);
        }
        if let Some(username) = &kafka.sasl_username {
            config.set("sasl.username", username);
        }
        if let Some(password) = &kafka.sasl_password {
            config.set("sasl.password", password);
        }
    }
    config
}

pub async fn test_connection(conn: &MqConnectionInfo) -> MqConnectionDiagnostics {
    let start = Instant::now();
    let mut stages = Vec::new();
    let consumer: Result<BaseConsumer, _> = kafka_config(conn).create();
    let success = match consumer {
        Ok(consumer) => match consumer.fetch_metadata(None, Duration::from_millis(conn.connect_timeout * 1000)) {
            Ok(metadata) => {
                stages.push(MqDiagnosticStage { name: "metadata".into(), status: "ok".into(), message: format!("{} broker(s), {} topic(s)", metadata.brokers().len(), metadata.topics().len()) });
                true
            }
            Err(err) => {
                stages.push(MqDiagnosticStage { name: "metadata".into(), status: "error".into(), message: err.to_string() });
                false
            }
        },
        Err(err) => {
            stages.push(MqDiagnosticStage { name: "client".into(), status: "error".into(), message: err.to_string() });
            false
        }
    };

    MqConnectionDiagnostics {
        broker_type: "kafka".into(),
        success,
        summary: if success { "Kafka metadata request succeeded".into() } else { "Kafka metadata request failed".into() },
        stages,
        duration_ms: start.elapsed().as_millis() as u64,
    }
}

pub async fn browse(conn: &MqConnectionInfo) -> Result<Vec<MqResourceNode>, String> {
    let consumer: BaseConsumer = kafka_config(conn).create().map_err(|err| err.to_string())?;
    let metadata = consumer
        .fetch_metadata(None, Duration::from_millis(conn.connect_timeout * 1000))
        .map_err(|err| err.to_string())?;

    let brokers = metadata
        .brokers()
        .iter()
        .map(|broker| MqResourceNode {
            key: format!("kafka:broker:{}", broker.id()),
            title: format!("{}:{}", broker.host(), broker.port()),
            node_type: "broker".into(),
            broker_type: "kafka".into(),
            metadata: serde_json::json!({ "id": broker.id(), "host": broker.host(), "port": broker.port() }),
            children: Vec::new(),
        })
        .collect();

    let topics = metadata
        .topics()
        .iter()
        .filter(|topic| !topic.name().starts_with("__"))
        .map(|topic| MqResourceNode {
            key: format!("kafka:topic:{}", topic.name()),
            title: topic.name().to_string(),
            node_type: "topic".into(),
            broker_type: "kafka".into(),
            metadata: serde_json::json!({ "partitions": topic.partitions().len() }),
            children: topic
                .partitions()
                .iter()
                .map(|partition| MqResourceNode {
                    key: format!("kafka:topic:{}:partition:{}", topic.name(), partition.id()),
                    title: format!("Partition {}", partition.id()),
                    node_type: "partition".into(),
                    broker_type: "kafka".into(),
                    metadata: serde_json::json!({ "id": partition.id(), "leader": partition.leader(), "replicas": partition.replicas(), "isr": partition.isr() }),
                    children: Vec::new(),
                })
                .collect(),
        })
        .collect();

    let groups = consumer
        .fetch_group_list(None, Duration::from_millis(conn.connect_timeout * 1000))
        .map(|list| {
            list.groups()
                .iter()
                .map(|group| MqResourceNode {
                    key: format!("kafka:consumer-group:{}", group.name()),
                    title: group.name().to_string(),
                    node_type: "consumer_group".into(),
                    broker_type: "kafka".into(),
                    metadata: serde_json::json!({
                        "state": group.state(),
                        "protocol": group.protocol(),
                        "protocolType": group.protocol_type(),
                        "members": group.members().len(),
                        "offsets": "read-only offset detail is broker/version dependent and not modified by DevNexus"
                    }),
                    children: Vec::new(),
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|_| Vec::new());

    Ok(vec![
        MqResourceNode { key: "kafka:topics".into(), title: "Topics".into(), node_type: "group".into(), broker_type: "kafka".into(), metadata: serde_json::json!({}), children: topics },
        MqResourceNode { key: "kafka:brokers".into(), title: "Brokers".into(), node_type: "group".into(), broker_type: "kafka".into(), metadata: serde_json::json!({}), children: brokers },
        MqResourceNode { key: "kafka:consumer-groups".into(), title: "Consumer Groups" .into(), node_type: "group".into(), broker_type: "kafka".into(), metadata: serde_json::json!({ "note": "Consumer group browsing is read-only and does not commit offsets." }), children: groups },
    ])
}

pub async fn publish(conn: &MqConnectionInfo, request: &MqPublishRequest) -> MqOperationResult {
    let start = Instant::now();
    let payload = match decode_body(&request.body) {
        Ok(bytes) => bytes,
        Err(err) => return MqOperationResult { status: "error".into(), summary: err.clone(), duration_ms: 0, messages: Vec::new(), error: Some(err) },
    };
    let producer: Result<FutureProducer, _> = kafka_config(conn).create();
    let result = async {
        let producer = producer.map_err(|err| err.to_string())?;
        let mut record = FutureRecord::to(&request.target).payload(&payload);
        if let Some(key) = &request.key {
            record = record.key(key);
        }
        if let Some(partition) = request.partition {
            record = record.partition(partition);
        }
        producer
            .send(record, Duration::from_millis(conn.connect_timeout * 1000))
            .await
            .map_err(|(err, _)| err.to_string())?;
        Ok::<(), String>(())
    }
    .await;

    match result {
        Ok(()) => MqOperationResult { status: "success".into(), summary: format!("Produced {} bytes", payload.len()), duration_ms: start.elapsed().as_millis() as u64, messages: Vec::new(), error: None },
        Err(err) => MqOperationResult { status: "error".into(), summary: err.clone(), duration_ms: start.elapsed().as_millis() as u64, messages: Vec::new(), error: Some(err) },
    }
}

pub async fn consume(conn: &MqConnectionInfo, request: &MqConsumeRequest) -> MqOperationResult {
    let start = Instant::now();
    let limit = request.limit.unwrap_or(10).clamp(1, 100);
    let timeout = Duration::from_millis(request.timeout_ms.unwrap_or(10_000).clamp(500, 30_000));
    let deadline = Instant::now() + timeout;
    let mut messages = Vec::new();

    let result = async {
        let mut config = kafka_config(conn);
        config.set("group.id", format!("devnexus-preview-{}", uuid::Uuid::new_v4()));
        let consumer: BaseConsumer = config.create().map_err(|err| err.to_string())?;
        if let Some(partition) = request.partition {
            let mut tpl = TopicPartitionList::new();
            let offset = match request.offset_mode.as_deref() {
                Some("specific") => rdkafka::Offset::Offset(request.offset.unwrap_or(0)),
                Some("latest") => rdkafka::Offset::End,
                _ => rdkafka::Offset::Beginning,
            };
            tpl.add_partition_offset(&request.target, partition, offset).map_err(|err| err.to_string())?;
            consumer.assign(&tpl).map_err(|err| err.to_string())?;
        } else {
            consumer.subscribe(&[&request.target]).map_err(|err| err.to_string())?;
        }

        while messages.len() < limit as usize && Instant::now() < deadline {
            if let Some(result) = consumer.poll(Duration::from_millis(250)) {
                let message = result.map_err(|err| err.to_string())?;
                let headers = message
                    .headers()
                    .map(|headers| {
                        (0..headers.count())
                            .map(|idx| {
                                let item = headers.get(idx);
                                MqKeyValue {
                                    key: item.key.to_string(),
                                    value: item.value.map(|value| encode_bytes(value, None).text).unwrap_or_default(),
                                    enabled: true,
                                    secret: None,
                                }
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                messages.push(MqMessagePreview {
                    target: message.topic().to_string(),
                    key: message.key().map(|key| encode_bytes(key, None)),
                    body: encode_bytes(message.payload().unwrap_or(&[]), None),
                    headers,
                    properties: Vec::new(),
                    partition: Some(message.partition()),
                    offset: Some(message.offset()),
                    timestamp: None,
                    redelivered: None,
                });
            }
        }
        Ok::<(), String>(())
    }
    .await;

    match result {
        Ok(()) => MqOperationResult { status: "success".into(), summary: format!("Previewed {} message(s); offsets were not committed", messages.len()), duration_ms: start.elapsed().as_millis() as u64, messages, error: None },
        Err(err) => MqOperationResult { status: "error".into(), summary: err.clone(), duration_ms: start.elapsed().as_millis() as u64, messages, error: Some(err) },
    }
}
