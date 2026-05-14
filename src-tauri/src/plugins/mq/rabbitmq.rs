use std::time::{Duration, Instant};

use lapin::{
    options::{BasicAckOptions, BasicGetOptions, BasicNackOptions, BasicPublishOptions},
    BasicProperties, Connection, ConnectionProperties,
};

use super::types::{
    MqConnectionDiagnostics, MqConnectionInfo, MqDiagnosticStage, MqKeyValue, MqMessagePreview,
    MqOperationResult, MqPublishRequest, MqResourceNode,
};
use super::utils::{decode_body, encode_bytes};

fn rabbit_config(conn: &MqConnectionInfo) -> Result<super::types::RabbitMqConfig, String> {
    conn.rabbitmq
        .clone()
        .ok_or_else(|| "RabbitMQ config is required".to_string())
}

fn amqp_url(conn: &MqConnectionInfo) -> Result<String, String> {
    let config = rabbit_config(conn)?;
    if let Some(url) = config.amqp_url.filter(|item| !item.trim().is_empty()) {
        return Ok(url);
    }
    conn.hosts
        .first()
        .cloned()
        .ok_or_else(|| "RabbitMQ AMQP URL is required".to_string())
}

fn management_base(conn: &MqConnectionInfo) -> Result<String, String> {
    rabbit_config(conn)?
        .management_url
        .filter(|item| !item.trim().is_empty())
        .ok_or_else(|| "RabbitMQ Management URL is required for browsing".to_string())
        .map(|item| item.trim_end_matches('/').to_string())
}

fn vhost(conn: &MqConnectionInfo) -> String {
    conn.rabbitmq
        .as_ref()
        .and_then(|config| config.virtual_host.clone())
        .filter(|item| !item.trim().is_empty())
        .unwrap_or_else(|| "/".to_string())
}

fn vhost_encoded(conn: &MqConnectionInfo) -> String {
    urlencoding::encode(&vhost(conn)).to_string()
}

async fn management_get(conn: &MqConnectionInfo, path: &str) -> Result<serde_json::Value, String> {
    let config = rabbit_config(conn)?;
    let client = reqwest::Client::new();
    let mut req = client.get(format!("{}{}", management_base(conn)?, path));
    if let Some(username) = config.management_username.or_else(|| conn.username.clone()) {
        req = req.basic_auth(username, config.management_password.or_else(|| conn.username.clone()));
    }
    let response = req.send().await.map_err(|err| format!("RabbitMQ Management request failed: {err}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("RabbitMQ Management returned HTTP {status}"));
    }
    response.json::<serde_json::Value>().await.map_err(|err| format!("parse RabbitMQ Management response failed: {err}"))
}

pub async fn test_connection(conn: &MqConnectionInfo) -> MqConnectionDiagnostics {
    let start = Instant::now();
    let mut stages = Vec::new();
    let mut success = true;

    match amqp_url(conn) {
        Ok(url) => match Connection::connect(&url, ConnectionProperties::default()).await {
            Ok(connection) => {
                stages.push(MqDiagnosticStage { name: "amqp".into(), status: "ok".into(), message: "AMQP connection established".into() });
                let _ = connection.close(0, "diagnostic complete".into()).await;
            }
            Err(err) => {
                success = false;
                stages.push(MqDiagnosticStage { name: "amqp".into(), status: "error".into(), message: err.to_string() });
            }
        },
        Err(err) => {
            success = false;
            stages.push(MqDiagnosticStage { name: "amqp".into(), status: "error".into(), message: err });
        }
    }

    if conn.rabbitmq.as_ref().and_then(|item| item.management_url.clone()).is_some() {
        match management_get(conn, "/api/overview").await {
            Ok(_) => stages.push(MqDiagnosticStage { name: "management".into(), status: "ok".into(), message: "Management API is available".into() }),
            Err(err) => stages.push(MqDiagnosticStage { name: "management".into(), status: "warning".into(), message: err }),
        }
    } else {
        stages.push(MqDiagnosticStage { name: "management".into(), status: "warning".into(), message: "Management URL not configured; resource browser is limited".into() });
    }

    MqConnectionDiagnostics {
        broker_type: "rabbitmq".into(),
        success,
        summary: if success { "RabbitMQ AMQP connection succeeded".into() } else { "RabbitMQ AMQP connection failed".into() },
        stages,
        duration_ms: start.elapsed().as_millis() as u64,
    }
}

fn json_nodes(items: &[serde_json::Value], node_type: &str, parent: &str) -> Vec<MqResourceNode> {
    items
        .iter()
        .filter_map(|item| {
            let title = item.get("name")?.as_str()?.to_string();
            Some(MqResourceNode {
                key: format!("rabbitmq:{parent}:{title}"),
                title,
                node_type: node_type.to_string(),
                broker_type: "rabbitmq".to_string(),
                metadata: item.clone(),
                children: Vec::new(),
            })
        })
        .collect()
}

pub async fn browse(conn: &MqConnectionInfo) -> Result<Vec<MqResourceNode>, String> {
    let encoded = vhost_encoded(conn);
    let queues = management_get(conn, &format!("/api/queues/{encoded}")).await?;
    let exchanges = management_get(conn, &format!("/api/exchanges/{encoded}")).await?;
    let bindings = management_get(conn, &format!("/api/bindings/{encoded}")).await?;

    Ok(vec![
        MqResourceNode { key: "rabbitmq:queues".into(), title: "Queues".into(), node_type: "group".into(), broker_type: "rabbitmq".into(), metadata: serde_json::json!({}), children: json_nodes(queues.as_array().map(Vec::as_slice).unwrap_or(&[]), "queue", "queue") },
        MqResourceNode { key: "rabbitmq:exchanges".into(), title: "Exchanges".into(), node_type: "group".into(), broker_type: "rabbitmq".into(), metadata: serde_json::json!({}), children: json_nodes(exchanges.as_array().map(Vec::as_slice).unwrap_or(&[]), "exchange", "exchange") },
        MqResourceNode { key: "rabbitmq:bindings".into(), title: "Bindings".into(), node_type: "group".into(), broker_type: "rabbitmq".into(), metadata: serde_json::json!({}), children: json_nodes(bindings.as_array().map(Vec::as_slice).unwrap_or(&[]), "binding", "binding") },
    ])
}

pub async fn publish(conn: &MqConnectionInfo, request: &MqPublishRequest) -> MqOperationResult {
    let start = Instant::now();
    let payload = match decode_body(&request.body) {
        Ok(bytes) => bytes,
        Err(err) => return MqOperationResult { status: "error".into(), summary: err.clone(), duration_ms: 0, messages: Vec::new(), error: Some(err) },
    };
    let result = async {
        let connection = Connection::connect(&amqp_url(conn)?, ConnectionProperties::default()).await.map_err(|err| err.to_string())?;
        let channel = connection.create_channel().await.map_err(|err| err.to_string())?;
        let exchange = request.target.trim();
        let routing_key = request.routing_key.as_deref().unwrap_or("").trim();
        if routing_key.is_empty() {
            return Err("routing key / queue is required for RabbitMQ publish".to_string());
        }
        channel
            .basic_publish(exchange.into(), routing_key.into(), BasicPublishOptions::default(), &payload, BasicProperties::default())
            .await
            .map_err(|err| err.to_string())?
            .await
            .map_err(|err| err.to_string())?;
        let _ = connection.close(0, "publish complete".into()).await;
        Ok::<(), String>(())
    }
    .await;

    match result {
        Ok(()) => MqOperationResult { status: "success".into(), summary: format!("Published {} bytes", payload.len()), duration_ms: start.elapsed().as_millis() as u64, messages: Vec::new(), error: None },
        Err(err) => MqOperationResult { status: "error".into(), summary: err.clone(), duration_ms: start.elapsed().as_millis() as u64, messages: Vec::new(), error: Some(err) },
    }
}

pub async fn consume(conn: &MqConnectionInfo, request: &super::types::MqConsumeRequest) -> MqOperationResult {
    let start = Instant::now();
    let limit = request.limit.unwrap_or(10).clamp(1, 100);
    let timeout = Duration::from_millis(request.timeout_ms.unwrap_or(10_000).clamp(500, 30_000));
    let deadline = Instant::now() + timeout;
    let mut messages = Vec::new();

    let result = async {
        let connection = Connection::connect(&amqp_url(conn)?, ConnectionProperties::default()).await.map_err(|err| err.to_string())?;
        let channel = connection.create_channel().await.map_err(|err| err.to_string())?;
        while messages.len() < limit as usize && Instant::now() < deadline {
            match channel.basic_get(request.target.clone().into(), BasicGetOptions::default()).await.map_err(|err| err.to_string())? {
                Some(delivery) => {
                    let headers: Vec<MqKeyValue> = Vec::new();
                    messages.push(MqMessagePreview {
                        target: request.target.clone(),
                        key: None,
                        body: encode_bytes(&delivery.data, delivery.properties.content_type().as_ref().map(|item| item.to_string())),
                        headers,
                        properties: Vec::new(),
                        partition: None,
                        offset: None,
                        timestamp: None,
                        redelivered: Some(delivery.redelivered),
                    });
                    if request.ack_mode.as_deref() == Some("ack") {
                        delivery.ack(BasicAckOptions::default()).await.map_err(|err| err.to_string())?;
                    } else {
                        delivery.nack(BasicNackOptions { multiple: false, requeue: true }).await.map_err(|err| err.to_string())?;
                    }
                }
                None => tokio::time::sleep(Duration::from_millis(200)).await,
            }
        }
        let _ = connection.close(0, "consume preview complete".into()).await;
        Ok::<(), String>(())
    }
    .await;

    match result {
        Ok(()) => MqOperationResult { status: "success".into(), summary: format!("Previewed {} message(s); default mode requeues messages", messages.len()), duration_ms: start.elapsed().as_millis() as u64, messages, error: None },
        Err(err) => MqOperationResult { status: "error".into(), summary: err.clone(), duration_ms: start.elapsed().as_millis() as u64, messages, error: Some(err) },
    }
}
