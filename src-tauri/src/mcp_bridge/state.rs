use super::{ActiveContext, McpBridgeStatus};
use crate::notebook_store::NotebookStore;
use std::{
    collections::HashMap,
    net::IpAddr,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

pub(super) const MCP_KEYRING_SERVICE: &str = "wrong-answer-notebook-mcp";
pub(super) const MCP_KEYRING_USER: &str = "bridge-token";
pub(super) const PAIRING_TTL: Duration = Duration::from_secs(5 * 60);
pub(super) const MAX_ACTIVE_PAIRING_CODES: usize = 3;
pub(super) const PAIRING_WINDOW: Duration = Duration::from_secs(60);
pub(super) const MAX_PAIRING_ATTEMPTS_PER_WINDOW: u32 = 5;
pub(super) const PAIRING_LOCKOUT: Duration = Duration::from_secs(60);
pub(super) const SESSION_TTL: Duration = Duration::from_secs(15 * 60);
pub(super) const MAX_RESOURCE_IMAGES: usize = 8;
pub(super) const MAX_RESOURCE_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Clone)]
pub(super) struct PairingAttempt {
    pub(super) window_started: Instant,
    pub(super) failures: u32,
    pub(super) blocked_until: Option<Instant>,
}

#[derive(Clone)]
pub(super) struct BridgeHttpState {
    pub(super) store: Arc<NotebookStore>,
    pub(super) images_path: PathBuf,
    pub(super) exam_sessions_path: PathBuf,
    pub(super) active_exam_context_path: PathBuf,
    pub(super) active_export_context_path: PathBuf,
    pub(super) process_session_id: String,
    pub(super) auth_token: Arc<Mutex<String>>,
    pub(super) pairing_codes: Arc<Mutex<HashMap<String, Instant>>>,
    pub(super) sessions: Arc<Mutex<HashMap<String, Instant>>>,
    pub(super) pairing_attempts: Arc<Mutex<HashMap<IpAddr, PairingAttempt>>>,
    pub(super) active_context: Arc<Mutex<ActiveContext>>,
    pub(super) status: Arc<Mutex<McpBridgeStatus>>,
    pub(super) audit_path: PathBuf,
}
