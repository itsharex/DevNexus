use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use mongodb::options::{ClientOptions, Credential, ServerAddress, Tls, TlsOptions};
use mongodb::Client;

use crate::db::mongodb_connection_repo::{MongoConnectionInfo, MongoConnectionSecret};

fn pool() -> &'static Arc<Mutex<HashMap<String, Client>>> {
    static POOL: OnceLock<Arc<Mutex<HashMap<String, Client>>>> = OnceLock::new();
    POOL.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

pub async fn build_client(
    config: &MongoConnectionInfo,
    secret: Option<MongoConnectionSecret>,
) -> Result<Client, String> {
    let secret = secret.unwrap_or(MongoConnectionSecret {
        uri: None,
        password: None,
    });

    let options = if config.mode == "uri" {
        let uri = secret
            .uri
            .ok_or_else(|| "mongodb uri is required".to_string())?;
        ClientOptions::parse(uri)
            .await
            .map_err(|err| format!("parse mongodb uri failed: {err}"))?
    } else if config.srv {
        let host = config
            .host
            .clone()
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "mongodb host is required".to_string())?;
        let auth = match (config.username.clone(), secret.password.clone()) {
            (Some(username), Some(password)) if !username.is_empty() => format!(
                "{}:{}@",
                urlencoding::encode(&username),
                urlencoding::encode(&password)
            ),
            (Some(username), _) if !username.is_empty() => {
                format!("{}@", urlencoding::encode(&username))
            }
            _ => String::new(),
        };
        let mut query = Vec::new();
        if let Some(source) = config
            .auth_database
            .clone()
            .filter(|value| !value.is_empty())
        {
            query.push(format!("authSource={}", urlencoding::encode(&source)));
        }
        if let Some(replica_set) = config.replica_set.clone().filter(|value| !value.is_empty()) {
            query.push(format!("replicaSet={}", urlencoding::encode(&replica_set)));
        }
        if config.tls {
            query.push("tls=true".to_string());
        }
        let uri = format!(
            "mongodb+srv://{}{}/{}{}",
            auth,
            host,
            config.default_database.clone().unwrap_or_default(),
            if query.is_empty() {
                String::new()
            } else {
                format!("?{}", query.join("&"))
            }
        );
        ClientOptions::parse(uri)
            .await
            .map_err(|err| format!("parse mongodb srv uri failed: {err}"))?
    } else {
        let host = config
            .host
            .clone()
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "mongodb host is required".to_string())?;
        let mut options = ClientOptions::builder()
            .hosts(vec![ServerAddress::Tcp {
                host,
                port: Some(config.port),
            }])
            .tls(config.tls.then(|| Tls::Enabled(TlsOptions::default())))
            .build();

        if let Some(replica_set) = config.replica_set.clone() {
            options.repl_set_name = Some(replica_set);
        }
        if let Some(username) = config.username.clone().filter(|value| !value.is_empty()) {
            options.credential = Some(
                Credential::builder()
                    .username(Some(username))
                    .password(secret.password)
                    .source(config.auth_database.clone())
                    .build(),
            );
        }
        options
    };

    Client::with_options(options).map_err(|err| format!("create mongodb client failed: {err}"))
}

pub fn get_client(conn_id: &str) -> Result<Client, String> {
    let guard = pool()
        .lock()
        .map_err(|_| "failed to acquire mongodb pool lock".to_string())?;
    guard
        .get(conn_id)
        .cloned()
        .ok_or_else(|| format!("mongodb connection `{conn_id}` not connected"))
}

pub fn put_client(conn_id: &str, client: Client) -> Result<(), String> {
    let mut guard = pool()
        .lock()
        .map_err(|_| "failed to acquire mongodb pool lock".to_string())?;
    guard.insert(conn_id.to_string(), client);
    Ok(())
}

pub fn remove_client(conn_id: &str) -> Result<(), String> {
    let mut guard = pool()
        .lock()
        .map_err(|_| "failed to acquire mongodb pool lock".to_string())?;
    guard.remove(conn_id);
    Ok(())
}
