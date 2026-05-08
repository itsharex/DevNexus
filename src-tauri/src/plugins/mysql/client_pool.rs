use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use mysql_async::{Opts, OptsBuilder, Pool};

use crate::db::mysql_connection_repo::{MysqlConnectionInfo, MysqlConnectionSecret};

fn pool_map() -> &'static Arc<Mutex<HashMap<String, Pool>>> {
    static POOL: OnceLock<Arc<Mutex<HashMap<String, Pool>>>> = OnceLock::new();
    POOL.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

pub fn build_pool(
    config: &MysqlConnectionInfo,
    secret: Option<MysqlConnectionSecret>,
) -> Result<Pool, String> {
    let password = secret.and_then(|item| item.password);
    let mut builder = OptsBuilder::default()
        .ip_or_hostname(config.host.clone())
        .tcp_port(config.port)
        .user(Some(config.username.clone()));
    if let Some(password) = password.filter(|value| !value.is_empty()) {
        builder = builder.pass(Some(password));
    }
    if let Some(database) = config.default_database.clone().filter(|value| !value.is_empty()) {
        builder = builder.db_name(Some(database));
    }
    let charset = config.charset.clone().unwrap_or_else(|| "utf8mb4".to_string());
    builder = builder.init(vec![format!("SET NAMES {charset}")]);
    Ok(Pool::new(Opts::from(builder)))
}

pub fn get_pool(conn_id: &str) -> Result<Pool, String> {
    let guard = pool_map()
        .lock()
        .map_err(|_| "failed to acquire mysql pool lock".to_string())?;
    guard
        .get(conn_id)
        .cloned()
        .ok_or_else(|| format!("mysql connection `{conn_id}` not connected"))
}

pub fn put_pool(conn_id: &str, pool: Pool) -> Result<(), String> {
    let mut guard = pool_map()
        .lock()
        .map_err(|_| "failed to acquire mysql pool lock".to_string())?;
    guard.insert(conn_id.to_string(), pool);
    Ok(())
}

pub async fn remove_pool(conn_id: &str) -> Result<(), String> {
    let pool = {
        let mut guard = pool_map()
            .lock()
            .map_err(|_| "failed to acquire mysql pool lock".to_string())?;
        guard.remove(conn_id)
    };
    if let Some(pool) = pool {
        pool.disconnect()
            .await
            .map_err(|err| format!("disconnect mysql pool failed: {err}"))?;
    }
    Ok(())
}

