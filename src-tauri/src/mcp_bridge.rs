//! Local, authenticated, read-only MCP-over-HTTP bridge.
//!
//! The transport intentionally exposes a very small JSON-RPC subset of the
//! Streamable HTTP MCP transport. It is loopback-only, defaults to stopped,
//! and has no mutation handler or filesystem path argument.

use crate::notebook_store::{normalize_question_number, NotebookStore, SearchQuery};
use axum::{
    body::Body,
    extract::State,
    http::{header, HeaderMap, Request, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use keyring::Entry as KeyringEntry;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Instant,
};
use tauri::async_runtime::JoinHandle;
use uuid::Uuid;

pub const DEFAULT_MCP_PORT: u16 = 43129;
const MCP_KEYRING_SERVICE: &str = "wrong-answer-notebook-mcp";
const MCP_KEYRING_USER: &str = "bridge-token";
const MCP_BRIDGE_VERSION: &str = "local-bridge-v1";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpBridgeStatus {
    pub enabled: bool,
    pub state: String,
    pub host: &'static str,
    pub port: u16,
    pub read_only: bool,
    pub bridge_version: &'static str,
    pub last_connected_at: Option<String>,
    pub last_error: Option<String>,
    pub has_auth_token: bool,
}

#[derive(Debug, Clone, Default)]
pub struct ActiveContext {
    pub entry_id: Option<String>,
    pub question_number: Option<String>,
}

pub struct McpBridgeManager {
    store: Arc<NotebookStore>,
    data_dir: PathBuf,
    active_context: Arc<Mutex<ActiveContext>>,
    status: Arc<Mutex<McpBridgeStatus>>,
    task: Mutex<Option<JoinHandle<()>>>,
}

impl McpBridgeManager {
    pub fn new(store: Arc<NotebookStore>, data_dir: PathBuf) -> Self {
        Self {
            store,
            data_dir,
            active_context: Arc::new(Mutex::new(ActiveContext::default())),
            status: Arc::new(Mutex::new(stopped_status())),
            task: Mutex::new(None),
        }
    }

    pub fn status(&self) -> McpBridgeStatus {
        self.status.lock().map(|status| status.clone()).unwrap_or_else(|_| stopped_status())
    }

    pub fn sync_active_context(&self, entry_id: Option<String>, question_number: Option<String>) {
        if let Ok(mut context) = self.active_context.lock() {
            context.entry_id = entry_id;
            context.question_number = question_number.map(|value| normalize_question_number(&value));
        }
    }

    pub async fn set_enabled(&self, enabled: bool, port: u16) -> Result<McpBridgeStatus, String> {
        if enabled { self.start(port).await?; } else { self.stop(); }
        Ok(self.status())
    }

    pub async fn test(&self) -> Result<McpBridgeStatus, String> {
        let status = self.status();
        if status.state != "running" {
            return Err("로컬 MCP 브리지가 실행 중이 아닙니다.".into());
        }
        // Binding succeeds before this state is made visible; no external request
        // is needed for the local health check.
        Ok(status)
    }

    async fn start(&self, port: u16) -> Result<(), String> {
        if self.status().state == "running" && self.status().port == port { return Ok(()); }
        if self.status().state == "running" { self.stop(); }
        let token = load_or_create_token()?;
        let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
        let listener = tokio::net::TcpListener::bind(address).await
            .map_err(|error| format!("로컬 MCP 포트 {port}를 열지 못했습니다: {error}"))?;
        let state = BridgeHttpState {
            store: Arc::clone(&self.store),
            token,
            active_context: Arc::clone(&self.active_context),
            status: Arc::clone(&self.status),
            audit_path: self.data_dir.join("mcp-audit.jsonl"),
        };
        if let Ok(mut status) = self.status.lock() {
            *status = McpBridgeStatus {
                enabled: true, state: "running".into(), host: "127.0.0.1", port,
                read_only: true, bridge_version: MCP_BRIDGE_VERSION, last_connected_at: None,
                last_error: None, has_auth_token: true,
            };
        }
        let app = Router::new()
            .route("/mcp", post(mcp_post).get(mcp_get))
            .layer(axum::extract::DefaultBodyLimit::max(1024 * 1024))
            .with_state(state);
        let task = tauri::async_runtime::spawn(async move {
            if let Err(error) = axum::serve(listener, app).await { eprintln!("local MCP bridge stopped: {error}"); }
        });
        if let Ok(mut handle) = self.task.lock() { *handle = Some(task); }
        Ok(())
    }

    fn stop(&self) {
        if let Ok(mut task) = self.task.lock() {
            if let Some(handle) = task.take() { handle.abort(); }
        }
        if let Ok(mut status) = self.status.lock() { *status = stopped_status(); }
    }
}

impl Drop for McpBridgeManager { fn drop(&mut self) { self.stop(); } }

fn stopped_status() -> McpBridgeStatus {
    McpBridgeStatus { enabled: false, state: "stopped".into(), host: "127.0.0.1", port: DEFAULT_MCP_PORT,
        read_only: true, bridge_version: MCP_BRIDGE_VERSION, last_connected_at: None, last_error: None, has_auth_token: false }
}

fn load_or_create_token() -> Result<String, String> {
    let entry = KeyringEntry::new(MCP_KEYRING_SERVICE, MCP_KEYRING_USER)
        .map_err(|error| format!("MCP 인증 저장소를 열지 못했습니다: {error}"))?;
    if let Ok(token) = entry.get_password() { if !token.trim().is_empty() { return Ok(token); } }
    let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    entry.set_password(&token).map_err(|error| format!("MCP 인증 토큰을 저장하지 못했습니다: {error}"))?;
    Ok(token)
}

#[derive(Clone)]
struct BridgeHttpState {
    store: Arc<NotebookStore>, token: String, active_context: Arc<Mutex<ActiveContext>>,
    status: Arc<Mutex<McpBridgeStatus>>, audit_path: PathBuf,
}

async fn mcp_get(State(state): State<BridgeHttpState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(response) = authorize(&state, &headers) { return response; }
    audit(&state, "health_check", true, 0, None);
    Json(json!({ "jsonrpc": "2.0", "result": { "status": "ok", "readOnly": true, "transport": "streamable-http" }, "id": Value::Null })).into_response()
}

async fn mcp_post(State(state): State<BridgeHttpState>, request: Request<Body>) -> impl IntoResponse {
    let (parts, body) = request.into_parts();
    if let Err(response) = authorize(&state, &parts.headers) { return response; }
    let bytes = match axum::body::to_bytes(body, 1024 * 1024).await { Ok(bytes) => bytes, Err(_) => return rpc_error(Value::Null, -32600, "요청 본문이 너무 큽니다.") };
    let rpc: RpcRequest = match serde_json::from_slice(&bytes) { Ok(value) => value, Err(_) => return rpc_error(Value::Null, -32700, "JSON-RPC 요청을 읽지 못했습니다.") };
    let started = Instant::now();
    let id = rpc.id.clone().unwrap_or(Value::Null);
    let response = dispatch(&state, rpc).await;
    let (success, count, code) = match &response { Ok((_, count)) => (true, *count, None), Err((code, _)) => (false, 0, Some(*code)) };
    audit(&state, "mcp", success, count, code);
    match response { Ok((value, _)) => Json(json!({"jsonrpc":"2.0", "id": id, "result": value})).into_response(), Err((code, message)) => {
        let _ = started; rpc_error(id, code, &message)
    } }
}

fn authorize(state: &BridgeHttpState, headers: &HeaderMap) -> Result<(), axum::response::Response> {
    if let Some(origin) = headers.get(header::ORIGIN).and_then(|value| value.to_str().ok()) {
        let valid = origin.starts_with("http://127.0.0.1") || origin.starts_with("http://localhost");
        if !valid { return Err((StatusCode::FORBIDDEN, "허용되지 않은 Origin입니다.").into_response()); }
    }
    let expected = format!("Bearer {}", state.token);
    match headers.get(header::AUTHORIZATION).and_then(|value| value.to_str().ok()) {
        Some(value) if value == expected => {
            if let Ok(mut status) = state.status.lock() { status.last_connected_at = Some(now_string()); }
            Ok(())
        }
        _ => Err((StatusCode::UNAUTHORIZED, "인증이 필요합니다.").into_response()),
    }
}

#[derive(Deserialize)]
struct RpcRequest { #[serde(default)] id: Option<Value>, method: String, #[serde(default)] params: Value }

async fn dispatch(state: &BridgeHttpState, rpc: RpcRequest) -> Result<(Value, usize), (i32, String)> {
    match rpc.method.as_str() {
        "initialize" => Ok((json!({"protocolVersion":"2025-03-26", "serverInfo":{"name":"wrong-answer-notebook","version":MCP_BRIDGE_VERSION}, "capabilities":{"tools":{}}}), 0)),
        "notifications/initialized" => Ok((json!({}), 0)),
        "tools/list" => Ok((json!({"tools": tool_definitions()}), 5)),
        "tools/call" => call_tool(state, rpc.params),
        _ => Err((-32601, "지원하지 않는 MCP 메서드입니다.".into())),
    }
}

fn tool_definitions() -> Vec<Value> { vec![
    json!({"name":"health_check","description":"로컬 읽기 전용 노트 상태를 확인합니다."}),
    json!({"name":"search_notebook","description":"노트를 검색합니다."}),
    json!({"name":"get_entry","description":"항목을 읽습니다. 정답/해설은 명시 요청 시에만 포함합니다."}),
    json!({"name":"get_question","description":"시험지 문항을 읽습니다."}),
    json!({"name":"get_active_question","description":"현재 앱에서 보고 있는 문항을 읽습니다."}),
] }

fn call_tool(state: &BridgeHttpState, params: Value) -> Result<(Value, usize), (i32, String)> {
    let name = params.get("name").and_then(Value::as_str).ok_or((-32602, "도구 이름이 필요합니다.".to_owned()))?;
    let args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
    let payload = match name {
        "health_check" => json!({"ok":true,"readOnly":true,"entryCount":state.store.load_entries().map_err(store_error)?.len(),"version":MCP_BRIDGE_VERSION}),
        "search_notebook" => search_payload(state, &args)?,
        "get_entry" => entry_payload(state, &args)?,
        "get_question" => question_payload(state, &args)?,
        "get_active_question" => active_question_payload(state, &args)?,
        _ => return Err((-32601, "읽기 전용 MCP 도구만 사용할 수 있습니다.".into())),
    };
    let count = payload.get("items").and_then(Value::as_array).map_or(1, Vec::len);
    Ok((json!({"content":[{"type":"text","text":serde_json::to_string(&payload).map_err(|_| (-32603,"응답을 만들지 못했습니다.".to_owned()))?}]}), count))
}

fn search_payload(state: &BridgeHttpState, args: &Value) -> Result<Value, (i32, String)> {
    let query = args.get("query").and_then(Value::as_str).unwrap_or("");
    let subject = args.get("subject").and_then(Value::as_str);
    let entry_kind = args.get("entryKind").and_then(Value::as_str);
    let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(20) as usize;
    let entries = state.store.search(SearchQuery { query, subject, entry_kind, limit }).map_err(store_error)?;
    Ok(json!({"items": entries.into_iter().map(|entry| json!({"id":entry.id,"title":entry.title,"subject":entry.subject,"entryKind":entry.entry_kind,"updatedAt":entry.updated_at,"questionCount":crate::notebook_store::parse_question_blocks(&entry.question).len(),"snippet":entry.question.chars().take(220).collect::<String>()})).collect::<Vec<_>>() }))
}

fn entry_payload(state: &BridgeHttpState, args: &Value) -> Result<Value, (i32, String)> {
    let entry_id = args.get("entryId").and_then(Value::as_str).ok_or((-32602, "entryId가 필요합니다.".to_owned()))?;
    let entry = state.store.get_entry(entry_id).map_err(store_error)?.ok_or((-32004, "항목을 찾지 못했습니다.".to_owned()))?;
    let answers = args.get("includeAnswers").and_then(Value::as_bool).unwrap_or(false);
    let explanations = args.get("includeExplanations").and_then(Value::as_bool).unwrap_or(false);
    let review = args.get("includeReview").and_then(Value::as_bool).unwrap_or(false);
    let mut item = json!({"id":entry.id,"title":entry.title,"subject":entry.subject,"entryKind":entry.entry_kind,"question":entry.question,"tags":entry.tags,"updatedAt":entry.updated_at});
    if answers { item["correctAnswer"] = Value::String(entry.correct_answer); item["answerKey"] = Value::Array(entry.answer_key.clone()); }
    if explanations { item["explanation"] = Value::String(entry.explanation); item["explanationParts"] = serde_json::to_value(entry.explanation_parts).unwrap_or(Value::Null); }
    if review { item["review"] = entry.review.unwrap_or(Value::Null); }
    Ok(item)
}

fn question_payload(state: &BridgeHttpState, args: &Value) -> Result<Value, (i32, String)> {
    let entry_id = args.get("entryId").and_then(Value::as_str).ok_or((-32602, "entryId가 필요합니다.".to_owned()))?;
    let number = args.get("questionNumber").and_then(Value::as_str).ok_or((-32602, "questionNumber가 필요합니다.".to_owned()))?;
    let question = state.store.get_question(entry_id, number).map_err(store_error)?.ok_or((-32004, "문항을 찾지 못했습니다.".to_owned()))?;
    let answer = args.get("includeAnswer").and_then(Value::as_bool).unwrap_or(false);
    let explanation = args.get("includeExplanation").and_then(Value::as_bool).unwrap_or(false);
    let include_review = args.get("includeReview").and_then(Value::as_bool).unwrap_or(false);
    let include_images = args.get("includeImages").and_then(Value::as_bool).unwrap_or(false);
    let mut item = json!({"entryId":question.entry.id,"questionNumber":question.question_number,"question":question.body,"choices":question.choices});
    if let Some(answer_key) = question.answer_key { if answer { item["answer"] = answer_key.get("answer").cloned().unwrap_or(Value::Null); } if explanation { item["explanation"] = answer_key.get("explanation").cloned().unwrap_or(Value::Null); } }
    if include_review { item["review"] = question.entry.review.unwrap_or(Value::Null); }
    if include_images { item["images"] = image_resources(&question.entry, &question.question_number); }
    Ok(item)
}

fn active_question_payload(state: &BridgeHttpState, args: &Value) -> Result<Value, (i32, String)> {
    let context = state.active_context.lock().map_err(|_| (-32603, "현재 문항 상태를 읽지 못했습니다.".to_owned()))?.clone();
    let Some(entry_id) = context.entry_id else { return Ok(json!({"active":false,"message":"앱에서 선택한 문항이 없습니다."})); };
    let number = context.question_number.unwrap_or_default();
    if number.is_empty() { return Ok(json!({"active":false,"entryId":entry_id,"message":"현재 항목에 선택된 문항이 없습니다."})); }
    let mut args = args.clone();
    args["entryId"] = Value::String(entry_id); args["questionNumber"] = Value::String(number);
    question_payload(state, &args)
}

fn image_resources(entry: &crate::WrongAnswerEntry, question_number: &str) -> Value {
    let normalized = normalize_question_number(question_number);
    let mut names = entry.question_images.clone();
    names.extend(entry.figures.iter().filter_map(|figure| figure.image.as_ref()).filter(|_| !normalized.is_empty()).cloned());
    names.sort(); names.dedup(); names.truncate(5);
    Value::Array(names.into_iter().map(|filename| json!({"uri":format!("notebook-image://entry/{}/{}", entry.id, filename),"filename":filename})).collect())
}

fn store_error(error: String) -> (i32, String) { (-32000, error) }
fn rpc_error(id: Value, code: i32, message: &str) -> axum::response::Response { Json(json!({"jsonrpc":"2.0","id":id,"error":{"code":code,"message":message}})).into_response() }
fn now_string() -> String { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|value| value.as_secs().to_string()).unwrap_or_else(|_| "0".into()) }
fn audit(state: &BridgeHttpState, tool: &str, success: bool, result_count: usize, error_code: Option<i32>) {
    if let Some(parent) = state.audit_path.parent() { let _ = fs::create_dir_all(parent); }
    if state.audit_path.metadata().map(|meta| meta.len() > 1_000_000).unwrap_or(false) { let _ = fs::rename(&state.audit_path, state.audit_path.with_extension("jsonl.1")); }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&state.audit_path) { let _ = writeln!(file, "{}", json!({"time":now_string(),"tool":tool,"success":success,"resultCount":result_count,"errorCode":error_code})); }
}
