use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use keyring::Entry as KeyringEntry;
use uuid::Uuid;

use super::{
    now_string,
    state::{BridgeHttpState, MCP_KEYRING_SERVICE, MCP_KEYRING_USER},
};
use std::time::Instant;

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

pub(super) fn authorize(state: &BridgeHttpState, headers: &HeaderMap) -> Result<(), Box<Response>> {
    if !origin_allowed(headers) {
        return Err(Box::new(
            (StatusCode::FORBIDDEN, "허용되지 않은 Origin입니다.").into_response(),
        ));
    }
    let Some(value) = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
    else {
        return Err(Box::new(
            (StatusCode::UNAUTHORIZED, "인증이 필요합니다.").into_response(),
        ));
    };
    let Some(token) = value.strip_prefix("Bearer ") else {
        return Err(Box::new(
            (StatusCode::UNAUTHORIZED, "인증이 필요합니다.").into_response(),
        ));
    };
    let self_test = headers
        .get("x-wan-self-test")
        .and_then(|value| value.to_str().ok())
        == Some("1");
    let authorized = if self_test {
        state
            .auth_token
            .lock()
            .map(|value| value.as_str() == token)
            .unwrap_or(false)
    } else {
        state
            .sessions
            .lock()
            .map(|mut sessions| {
                sessions.retain(|_, expires| *expires > Instant::now());
                sessions.contains_key(token)
            })
            .unwrap_or(false)
    };
    if !authorized {
        return Err(Box::new(
            (StatusCode::UNAUTHORIZED, "인증이 필요합니다.").into_response(),
        ));
    }
    if !self_test {
        if let Ok(mut status) = state.status.lock() {
            status.last_client_connected_at = Some(now_string());
        }
    }
    Ok(())
}

pub(super) fn origin_allowed(headers: &HeaderMap) -> bool {
    let Some(origin) = headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
    else {
        return true;
    };
    let Ok(url) = reqwest::Url::parse(origin) else {
        return false;
    };
    url.scheme() == "http" && matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "::1"))
}
