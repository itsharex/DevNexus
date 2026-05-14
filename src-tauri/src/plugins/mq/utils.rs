use base64::Engine;

use super::types::EncodedMessageBody;

const SENSITIVE_KEYS: [&str; 8] = [
    "password",
    "authorization",
    "cookie",
    "token",
    "secret",
    "key",
    "sasl",
    "management_password",
];

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn trim_option(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

pub fn normalize_hosts(hosts: Vec<String>) -> Vec<String> {
    hosts
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect()
}

pub fn should_mask(key: &str) -> bool {
    let lowered = key.to_ascii_lowercase();
    SENSITIVE_KEYS.iter().any(|needle| lowered.contains(needle))
}

pub fn redact_json(value: serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Object(map) => serde_json::Value::Object(
            map.into_iter()
                .map(|(key, value)| {
                    if should_mask(&key) {
                        (key, serde_json::Value::String("******".to_string()))
                    } else {
                        (key, redact_json(value))
                    }
                })
                .collect(),
        ),
        serde_json::Value::Array(values) => serde_json::Value::Array(values.into_iter().map(redact_json).collect()),
        other => other,
    }
}

pub fn decode_body(body: &EncodedMessageBody) -> Result<Vec<u8>, String> {
    match body.encoding.as_str() {
        "base64" => base64::engine::general_purpose::STANDARD
            .decode(body.text.as_bytes())
            .map_err(|err| format!("invalid base64 body: {err}")),
        _ => Ok(body.text.as_bytes().to_vec()),
    }
}

pub fn encode_bytes(bytes: &[u8], content_type: Option<String>) -> EncodedMessageBody {
    match std::str::from_utf8(bytes) {
        Ok(text) => EncodedMessageBody {
            encoding: "utf8".to_string(),
            text: text.to_string(),
            content_type,
            size_bytes: bytes.len() as u64,
        },
        Err(_) => EncodedMessageBody {
            encoding: "base64".to_string(),
            text: base64::engine::general_purpose::STANDARD.encode(bytes),
            content_type,
            size_bytes: bytes.len() as u64,
        },
    }
}

pub fn json_or_empty<T: serde::Serialize>(value: &T, fallback: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| fallback.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_sensitive_json() {
        let value = serde_json::json!({ "authorization": "Bearer token" });
        assert_eq!(redact_json(value)["authorization"], "******");
    }

    #[test]
    fn round_trips_base64_body() {
        let body = EncodedMessageBody { encoding: "base64".into(), text: "aGVsbG8=".into(), content_type: None, size_bytes: 5 };
        assert_eq!(decode_body(&body).unwrap(), b"hello");
    }
}
