use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use aws_credential_types::Credentials;
use aws_sdk_s3::config::Builder as S3ConfigBuilder;
use aws_sdk_s3::Client;

use crate::db::s3_connection_repo::S3ConnectionInfo;

fn pool() -> &'static Arc<Mutex<HashMap<String, Client>>> {
    static POOL: OnceLock<Arc<Mutex<HashMap<String, Client>>>> = OnceLock::new();
    POOL.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

fn provider_endpoint(provider: &str, region: &str) -> Option<String> {
    match provider {
        "aliyun" => Some(format!("https://oss-{region}.aliyuncs.com")),
        "tencent" => Some(format!("https://cos.{region}.myqcloud.com")),
        "r2" => Some(format!("https://{region}.r2.cloudflarestorage.com")),
        _ => None,
    }
}

fn resolve_endpoint(config: &S3ConnectionInfo) -> Option<String> {
    if let Some(endpoint) = config.endpoint.clone() {
        let trimmed = endpoint.trim().to_string();
        if !trimmed.is_empty() {
            return Some(trimmed);
        }
    }
    provider_endpoint(config.provider.as_str(), config.region.as_str())
}

pub async fn build_client(
    config: &S3ConnectionInfo,
    secret_access_key: &str,
) -> Result<Client, String> {
    let credentials = Credentials::new(
        config.access_key_id.clone(),
        secret_access_key.to_string(),
        None,
        None,
        "devnexus-s3",
    );
    let mut loader = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(aws_config::Region::new(config.region.clone()))
        .credentials_provider(credentials);
    if let Some(endpoint) = resolve_endpoint(config) {
        loader = loader.endpoint_url(endpoint);
    }
    let shared = loader.load().await;

    let mut builder = S3ConfigBuilder::from(&shared);
    if config.path_style {
        builder = builder.force_path_style(true);
    }
    let client = Client::from_conf(builder.build());
    Ok(client)
}

pub fn get_client(conn_id: &str) -> Result<Client, String> {
    let guard = pool()
        .lock()
        .map_err(|_| "failed to acquire s3 pool lock".to_string())?;
    guard
        .get(conn_id)
        .cloned()
        .ok_or_else(|| format!("s3 connection `{conn_id}` not connected"))
}

pub fn put_client(conn_id: &str, client: Client) -> Result<(), String> {
    let mut guard = pool()
        .lock()
        .map_err(|_| "failed to acquire s3 pool lock".to_string())?;
    guard.insert(conn_id.to_string(), client);
    Ok(())
}

pub fn remove_client(conn_id: &str) -> Result<(), String> {
    let mut guard = pool()
        .lock()
        .map_err(|_| "failed to acquire s3 pool lock".to_string())?;
    guard.remove(conn_id);
    Ok(())
}
