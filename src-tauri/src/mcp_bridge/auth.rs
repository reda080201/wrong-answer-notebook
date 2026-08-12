use keyring::Entry as KeyringEntry;
use uuid::Uuid;

use super::state::{MCP_KEYRING_SERVICE, MCP_KEYRING_USER};

pub(super) fn new_token() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

fn keyring_entry() -> Result<KeyringEntry, String> {
    KeyringEntry::new(MCP_KEYRING_SERVICE, MCP_KEYRING_USER)
        .map_err(|e| format!("MCP 인증 저장소를 열지 못했습니다: {e}"))
}

pub(super) fn store_token(token: &str) -> Result<(), String> {
    keyring_entry()?
        .set_password(token)
        .map_err(|e| format!("MCP 인증 토큰을 저장하지 못했습니다: {e}"))
}

pub(super) fn load_or_create_token() -> Result<String, String> {
    let entry = keyring_entry()?;
    if let Ok(token) = entry.get_password() {
        if !token.trim().is_empty() {
            return Ok(token);
        }
    }
    let token = new_token();
    entry
        .set_password(&token)
        .map_err(|e| format!("MCP 인증 토큰을 저장하지 못했습니다: {e}"))?;
    Ok(token)
}
