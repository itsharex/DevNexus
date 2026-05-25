use base64::Engine;
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use serde_json::Value;
use std::time::Duration;

use super::types::{AttachmentInfo, PageInfo, SpaceInfo};

pub struct ConfluenceClient {
    http: reqwest::Client,
    base_url: String,
    auth_header: String,
}

impl ConfluenceClient {
    pub fn new(base_url: &str, username: &str, password: &str) -> Self {
        let base_url = base_url.trim_end_matches('/').to_string();
        let credentials = format!("{username}:{password}");
        let encoded = base64::engine::general_purpose::STANDARD.encode(credentials.as_bytes());
        let auth_header = format!("Basic {encoded}");
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .danger_accept_invalid_certs(true)
            .build()
            .unwrap_or_default();
        Self {
            http,
            base_url,
            auth_header,
        }
    }

    pub async fn test_connection(&self) -> Result<(), String> {
        let url = format!("{}/rest/api/space?limit=1", self.base_url);
        let resp = self
            .http
            .get(&url)
            .header(AUTHORIZATION, &self.auth_header)
            .header(ACCEPT, "application/json")
            .send()
            .await
            .map_err(|e| format!("Connection failed: {e}"))?;
        if resp.status().as_u16() == 401 {
            return Err("Authentication failed (401). Check username and password.".into());
        }
        if !resp.status().is_success() {
            return Err(format!("HTTP {}: {}", resp.status(), resp.status().canonical_reason().unwrap_or("unknown")));
        }
        Ok(())
    }

    pub async fn list_spaces(&self) -> Result<Vec<SpaceInfo>, String> {
        let url = format!("{}/rest/api/space?limit=200", self.base_url);
        let resp = self
            .http
            .get(&url)
            .header(AUTHORIZATION, &self.auth_header)
            .header(ACCEPT, "application/json")
            .send()
            .await
            .map_err(|e| format!("List spaces failed: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("List spaces HTTP {}", resp.status()));
        }
        let body: Value = resp.json().await.map_err(|e| format!("JSON parse failed: {e}"))?;
        let spaces: Vec<SpaceInfo> = body["results"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|s| {
                        Some(SpaceInfo {
                            key: s["key"].as_str()?.to_string(),
                            name: s["name"].as_str()?.to_string(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        Ok(spaces)
    }

    pub async fn list_pages(&self, space_key: &str, parent_id: Option<&str>) -> Result<Vec<PageInfo>, String> {
        let url = if let Some(pid) = parent_id {
            format!("{}/rest/api/content/{}/child/page?limit=200", self.base_url, pid)
        } else {
            format!(
                "{}/rest/api/content?type=page&spaceKey={}&limit=200",
                self.base_url, space_key
            )
        };
        let resp = self
            .http
            .get(&url)
            .header(AUTHORIZATION, &self.auth_header)
            .header(ACCEPT, "application/json")
            .send()
            .await
            .map_err(|e| format!("List pages failed: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("List pages HTTP {}", resp.status()));
        }
        let body: Value = resp.json().await.map_err(|e| format!("JSON parse failed: {e}"))?;
        let pages: Vec<PageInfo> = body["results"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|p| {
                        Some(PageInfo {
                            id: p["id"].as_str()?.to_string(),
                            title: p["title"].as_str()?.to_string(),
                            version: p["version"]["number"].as_u64().unwrap_or(1) as u32,
                            space_key: space_key.to_string(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        Ok(pages)
    }

    pub async fn create_page(
        &self,
        space_key: &str,
        title: &str,
        content_xml: &str,
        parent_id: Option<&str>,
    ) -> Result<PageInfo, String> {
        let url = format!("{}/rest/api/content", self.base_url);
        let mut body = serde_json::json!({
            "type": "page",
            "title": title,
            "space": { "key": space_key },
            "body": {
                "storage": {
                    "value": content_xml,
                    "representation": "storage"
                }
            }
        });
        if let Some(pid) = parent_id {
            body["ancestors"] = serde_json::json!([{ "id": pid }]);
        }
        let resp = self
            .http
            .post(&url)
            .header(AUTHORIZATION, &self.auth_header)
            .header(CONTENT_TYPE, "application/json")
            .header(ACCEPT, "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Create page failed: {e}"))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("Create page HTTP {}: {}", status, text));
        }
        let result: Value = resp.json().await.map_err(|e| format!("JSON parse failed: {e}"))?;
        Ok(PageInfo {
            id: result["id"].as_str().unwrap_or_default().to_string(),
            title: result["title"].as_str().unwrap_or_default().to_string(),
            version: result["version"]["number"].as_u64().unwrap_or(1) as u32,
            space_key: space_key.to_string(),
        })
    }

    pub async fn update_page(
        &self,
        page_id: &str,
        title: &str,
        content_xml: &str,
        version: u32,
    ) -> Result<PageInfo, String> {
        let url = format!("{}/rest/api/content/{}", self.base_url, page_id);
        let body = serde_json::json!({
            "type": "page",
            "title": title,
            "version": { "number": version + 1 },
            "body": {
                "storage": {
                    "value": content_xml,
                    "representation": "storage"
                }
            }
        });
        let resp = self
            .http
            .put(&url)
            .header(AUTHORIZATION, &self.auth_header)
            .header(CONTENT_TYPE, "application/json")
            .header(ACCEPT, "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Update page failed: {e}"))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("Update page HTTP {}: {}", status, text));
        }
        let result: Value = resp.json().await.map_err(|e| format!("JSON parse failed: {e}"))?;
        Ok(PageInfo {
            id: result["id"].as_str().unwrap_or_default().to_string(),
            title: result["title"].as_str().unwrap_or_default().to_string(),
            version: result["version"]["number"].as_u64().unwrap_or(1) as u32,
            space_key: result["space"]["key"].as_str().unwrap_or_default().to_string(),
        })
    }

    pub async fn upload_attachment(
        &self,
        page_id: &str,
        file_name: &str,
        file_bytes: Vec<u8>,
        content_type: &str,
    ) -> Result<AttachmentInfo, String> {
        let url = format!(
            "{}/rest/api/content/{}/child/attachment",
            self.base_url, page_id
        );
        let part = reqwest::multipart::Part::bytes(file_bytes)
            .file_name(file_name.to_string())
            .mime_str(content_type)
            .map_err(|e| format!("MIME error: {e}"))?;
        let form = reqwest::multipart::Form::new().part("file", part);
        let resp = self
            .http
            .post(&url)
            .header(AUTHORIZATION, &self.auth_header)
            .header("X-Atlassian-Token", "nocheck")
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("Upload attachment failed: {e}"))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("Upload attachment HTTP {}: {}", status, text));
        }
        let result: Value = resp.json().await.map_err(|e| format!("JSON parse failed: {e}"))?;
        let results = result["results"].as_array();
        let att = results.and_then(|a| a.first()).unwrap_or(&result);
        Ok(AttachmentInfo {
            id: att["id"].as_str().unwrap_or_default().to_string(),
            title: att["title"].as_str().unwrap_or_default().to_string(),
            download_url: att["_links"]["download"].as_str().unwrap_or_default().to_string(),
        })
    }
}
