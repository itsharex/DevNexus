use crate::db::s3_connection_repo::{self, S3ConnectionForm, S3ConnectionInfo};
use aws_sdk_s3::types::{BucketLocationConstraint, CreateBucketConfiguration};

use super::types::S3Latency;

#[tauri::command]
pub fn cmd_s3_list_connections(
    app_handle: tauri::AppHandle,
) -> Result<Vec<S3ConnectionInfo>, String> {
    s3_connection_repo::list_s3_connections(&app_handle)
}

#[tauri::command]
pub fn cmd_s3_save_connection(
    app_handle: tauri::AppHandle,
    form: S3ConnectionForm,
) -> Result<String, String> {
    s3_connection_repo::save_s3_connection(&app_handle, form)
}

#[tauri::command]
pub fn cmd_s3_delete_connection(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    super::client_pool::remove_client(&id)?;
    s3_connection_repo::delete_s3_connection(&app_handle, &id)
}

#[tauri::command]
pub async fn cmd_s3_test_connection(form: S3ConnectionForm) -> Result<S3Latency, String> {
    if form.name.trim().is_empty() {
        return Err("name is required".to_string());
    }
    if form.access_key_id.trim().is_empty() {
        return Err("accessKeyId is required".to_string());
    }
    let secret = form.secret_access_key.clone().unwrap_or_default();
    if secret.trim().is_empty() {
        return Err("secretAccessKey is required".to_string());
    }
    if form.region.trim().is_empty() {
        return Err("region is required".to_string());
    }
    if form.provider == "custom" {
        let endpoint = form.endpoint.clone().unwrap_or_default();
        if endpoint.trim().is_empty() {
            return Err("endpoint is required for custom provider".to_string());
        }
    }

    let info = S3ConnectionInfo {
        id: form.id.clone().unwrap_or_else(|| "temp".to_string()),
        name: form.name.clone(),
        group_name: form.group_name.clone(),
        provider: form.provider.clone(),
        endpoint: form.endpoint.clone(),
        region: form.region.clone(),
        access_key_id: form.access_key_id.clone(),
        path_style: form.path_style.unwrap_or(false),
        default_bucket: form.default_bucket.clone(),
        created_at: String::new(),
    };

    let started = std::time::Instant::now();
    let client = super::client_pool::build_client(&info, &secret).await?;
    client
        .list_buckets()
        .send()
        .await
        .map_err(|err| format!("list buckets failed: {err}"))?;
    Ok(S3Latency {
        millis: started.elapsed().as_millis() as u64,
    })
}

#[tauri::command]
pub async fn cmd_s3_connect(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    let info = s3_connection_repo::get_s3_connection(&app_handle, &id)?
        .ok_or_else(|| format!("s3 connection `{id}` not found"))?;
    let secret = s3_connection_repo::get_s3_secret_access_key(&app_handle, &id)?
        .ok_or_else(|| "secretAccessKey not found".to_string())?;
    let client = super::client_pool::build_client(&info, &secret).await?;
    super::client_pool::put_client(&id, client)
}

#[tauri::command]
pub fn cmd_s3_disconnect(id: String) -> Result<(), String> {
    super::client_pool::remove_client(&id)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct S3BucketInfo {
    pub name: String,
    pub creation_date: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct S3ObjectItem {
    pub key: String,
    pub size: i64,
    pub last_modified: Option<String>,
    pub etag: Option<String>,
    pub storage_class: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct S3ListObjectsResult {
    pub objects: Vec<S3ObjectItem>,
    pub common_prefixes: Vec<String>,
    pub next_token: Option<String>,
    pub is_truncated: bool,
}

#[tauri::command]
pub async fn cmd_s3_list_buckets(conn_id: String) -> Result<Vec<S3BucketInfo>, String> {
    let client = super::client_pool::get_client(&conn_id)?;
    let resp = client
        .list_buckets()
        .send()
        .await
        .map_err(|err| format!("list buckets failed: {err}"))?;
    let mut out = Vec::new();
    if let Some(items) = resp.buckets {
        for item in items {
            let name = item.name.unwrap_or_default();
            if name.trim().is_empty() {
                continue;
            }
            out.push(S3BucketInfo {
                name,
                creation_date: item.creation_date.map(|v| v.to_string()),
            });
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn cmd_s3_create_bucket(
    app_handle: tauri::AppHandle,
    conn_id: String,
    name: String,
    region: Option<String>,
) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("bucket name is required".to_string());
    }
    let info = s3_connection_repo::get_s3_connection(&app_handle, &conn_id)?
        .ok_or_else(|| format!("s3 connection `{conn_id}` not found"))?;
    let bucket_region = region.unwrap_or_else(|| info.region.clone());
    let client = super::client_pool::get_client(&conn_id)?;

    let mut req = client.create_bucket().bucket(name.trim().to_string());
    let is_aws_like = matches!(info.provider.as_str(), "aws" | "aliyun" | "tencent" | "r2");
    if is_aws_like && bucket_region != "us-east-1" {
        let conf = CreateBucketConfiguration::builder()
            .location_constraint(BucketLocationConstraint::from(bucket_region.as_str()))
            .build();
        req = req.create_bucket_configuration(conf);
    }
    req.send()
        .await
        .map_err(|err| format!("create bucket failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_s3_delete_bucket(conn_id: String, name: String) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("bucket name is required".to_string());
    }
    let client = super::client_pool::get_client(&conn_id)?;
    client
        .delete_bucket()
        .bucket(name.trim().to_string())
        .send()
        .await
        .map_err(|err| format!("delete bucket failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_s3_list_objects(
    conn_id: String,
    bucket: String,
    prefix: Option<String>,
    continuation_token: Option<String>,
    max_keys: Option<i32>,
) -> Result<S3ListObjectsResult, String> {
    if bucket.trim().is_empty() {
        return Err("bucket is required".to_string());
    }
    let client = super::client_pool::get_client(&conn_id)?;
    let mut req = client
        .list_objects_v2()
        .bucket(bucket.trim().to_string())
        .delimiter("/")
        .max_keys(max_keys.unwrap_or(200).max(1));
    if let Some(p) = prefix {
        let trimmed = p.trim().to_string();
        if !trimmed.is_empty() {
            req = req.prefix(trimmed);
        }
    }
    if let Some(token) = continuation_token {
        let trimmed = token.trim().to_string();
        if !trimmed.is_empty() {
            req = req.continuation_token(trimmed);
        }
    }

    let resp = req
        .send()
        .await
        .map_err(|err| format!("list objects failed: {err}"))?;

    let mut objects = Vec::new();
    if let Some(contents) = resp.contents {
        for item in contents {
            let key = item.key.unwrap_or_default();
            if key.is_empty() {
                continue;
            }
            objects.push(S3ObjectItem {
                key,
                size: item.size.unwrap_or(0),
                last_modified: item.last_modified.map(|v| v.to_string()),
                etag: item.e_tag,
                storage_class: item.storage_class.map(|v| v.as_str().to_string()),
            });
        }
    }

    let mut prefixes = Vec::new();
    if let Some(common_prefixes) = resp.common_prefixes {
        for item in common_prefixes {
            if let Some(prefix) = item.prefix {
                if !prefix.is_empty() {
                    prefixes.push(prefix);
                }
            }
        }
    }

    Ok(S3ListObjectsResult {
        objects,
        common_prefixes: prefixes,
        next_token: resp.next_continuation_token,
        is_truncated: resp.is_truncated.unwrap_or(false),
    })
}

#[tauri::command]
pub async fn cmd_s3_delete_object(
    conn_id: String,
    bucket: String,
    key: String,
    version_id: Option<String>,
) -> Result<(), String> {
    if bucket.trim().is_empty() || key.trim().is_empty() {
        return Err("bucket and key are required".to_string());
    }
    let client = super::client_pool::get_client(&conn_id)?;
    let mut req = client
        .delete_object()
        .bucket(bucket.trim().to_string())
        .key(key.trim().to_string());
    if let Some(v) = version_id {
        let trimmed = v.trim().to_string();
        if !trimmed.is_empty() {
            req = req.version_id(trimmed);
        }
    }
    req.send()
        .await
        .map_err(|err| format!("delete object failed: {err}"))?;
    Ok(())
}

#[tauri::command]
pub async fn cmd_s3_create_folder(conn_id: String, bucket: String, prefix: String) -> Result<(), String> {
    if bucket.trim().is_empty() || prefix.trim().is_empty() {
        return Err("bucket and prefix are required".to_string());
    }
    let key = if prefix.ends_with('/') {
        prefix
    } else {
        format!("{prefix}/")
    };
    let client = super::client_pool::get_client(&conn_id)?;
    client
        .put_object()
        .bucket(bucket.trim().to_string())
        .key(key)
        .body(aws_sdk_s3::primitives::ByteStream::from_static(b""))
        .send()
        .await
        .map_err(|err| format!("create folder failed: {err}"))?;
    Ok(())
}
