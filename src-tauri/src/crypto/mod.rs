use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use std::fs;
use std::path::PathBuf;

const KEY_FILE_NAME: &str = "devnexus.key";
const LEGACY_KEY_FILE_NAME: &str = "rdmm.key";
const NONCE_BYTES: [u8; 12] = [0; 12];

fn key_file_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = crate::db::init::data_dir(app_handle)?;
    let current = dir.join(KEY_FILE_NAME);
    let legacy = dir.join(LEGACY_KEY_FILE_NAME);
    if !current.exists() && legacy.exists() {
        fs::rename(&legacy, &current)
            .map_err(|err| format!("failed to migrate legacy key path: {err}"))?;
    }
    Ok(current)
}

fn load_or_create_key(app_handle: &tauri::AppHandle) -> Result<Vec<u8>, String> {
    let key_path = key_file_path(app_handle)?;

    if key_path.exists() {
        let content =
            fs::read_to_string(&key_path).map_err(|err| format!("failed to read key: {err}"))?;
        let bytes = hex::decode(content.trim()).map_err(|err| format!("invalid key hex: {err}"))?;
        if bytes.len() != 32 {
            return Err("invalid key size".to_string());
        }
        return Ok(bytes);
    }

    let bytes = uuid::Uuid::new_v4().as_bytes().repeat(2);
    let key_hex = hex::encode(&bytes);
    fs::write(&key_path, key_hex).map_err(|err| format!("failed to write key: {err}"))?;
    Ok(bytes)
}

pub fn encrypt(app_handle: &tauri::AppHandle, plaintext: &str) -> Result<String, String> {
    if plaintext.is_empty() {
        return Ok(String::new());
    }

    let key_bytes = load_or_create_key(app_handle)?;
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(&NONCE_BYTES);

    let encrypted = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|err| format!("encrypt failed: {err}"))?;

    Ok(hex::encode(encrypted))
}

pub fn decrypt(app_handle: &tauri::AppHandle, ciphertext: &str) -> Result<String, String> {
    if ciphertext.is_empty() {
        return Ok(String::new());
    }

    let key_bytes = load_or_create_key(app_handle)?;
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(&NONCE_BYTES);
    let ciphertext_bytes =
        hex::decode(ciphertext).map_err(|err| format!("ciphertext decode failed: {err}"))?;

    let decrypted = cipher
        .decrypt(nonce, ciphertext_bytes.as_ref())
        .map_err(|err| format!("decrypt failed: {err}"))?;

    String::from_utf8(decrypted).map_err(|err| format!("utf8 decode failed: {err}"))
}
