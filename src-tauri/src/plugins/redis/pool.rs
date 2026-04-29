use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use crate::db::connection_repo::ConnectionInfo;

fn encode_password(password: &str) -> String {
    urlencoding::encode(password).to_string()
}

fn pool() -> &'static Mutex<HashMap<String, redis::Client>> {
    static POOL: OnceLock<Mutex<HashMap<String, redis::Client>>> = OnceLock::new();
    POOL.get_or_init(|| Mutex::new(HashMap::new()))
}

fn build_url(config: &ConnectionInfo, password: Option<&str>) -> String {
    match password {
        Some(value) if !value.is_empty() => format!(
            "redis://:{}@{}:{}/{}",
            encode_password(value),
            config.host,
            config.port,
            config.db_index
        ),
        _ => format!("redis://{}:{}/{}", config.host, config.port, config.db_index),
    }
}

fn ping(client: &redis::Client) -> Result<(), String> {
    let mut conn = client
        .get_connection()
        .map_err(|err| format!("failed to open redis connection: {err}"))?;

    redis::cmd("PING")
        .query::<String>(&mut conn)
        .map(|_| ())
        .map_err(|err| format!("redis ping failed: {err}"))
}

pub fn connect(id: &str, config: &ConnectionInfo, password: Option<&str>) -> Result<(), String> {
    let client = redis::Client::open(build_url(config, password).as_str())
        .map_err(|err| format!("failed to create redis client: {err}"))?;
    ping(&client)?;
    let mut guard = pool()
        .lock()
        .map_err(|_| "failed to acquire redis pool lock".to_string())?;
    guard.insert(id.to_string(), client);
    Ok(())
}

pub fn disconnect(id: &str) -> Result<(), String> {
    let mut guard = pool()
        .lock()
        .map_err(|_| "failed to acquire redis pool lock".to_string())?;
    guard.remove(id);
    Ok(())
}

pub fn get_client(id: &str) -> Result<redis::Client, String> {
    let guard = pool()
        .lock()
        .map_err(|_| "failed to acquire redis pool lock".to_string())?;

    guard
        .get(id)
        .cloned()
        .ok_or_else(|| format!("redis client not found for connection id `{id}`"))
}

pub fn test(config: &ConnectionInfo, password: Option<&str>) -> Result<u64, String> {
    let start = std::time::Instant::now();
    let client = redis::Client::open(build_url(config, password).as_str())
        .map_err(|err| format!("failed to create redis client: {err}"))?;
    ping(&client)?;
    Ok(start.elapsed().as_millis() as u64)
}
