//! Loopback-only, authenticated, read-only MCP Streamable HTTP bridge.

use crate::notebook_store::{
    matched_snippet, normalize_question_number, NotebookStore, SearchQuery,
};
use axum::{
    body::Body,
    extract::{ConnectInfo, State},
    http::{header, HeaderMap, Request, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use keyring::Entry as KeyringEntry;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::{Read, Write},
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::async_runtime::JoinHandle;
use uuid::Uuid;

pub const DEFAULT_MCP_PORT: u16 = 43129;
const MCP_KEYRING_SERVICE: &str = "wrong-answer-notebook-mcp";
const MCP_KEYRING_USER: &str = "bridge-token";
const MCP_BRIDGE_VERSION: &str = "local-bridge-v2";
const PAIRING_TTL: Duration = Duration::from_secs(5 * 60);
const MAX_ACTIVE_PAIRING_CODES: usize = 3;
const PAIRING_WINDOW: Duration = Duration::from_secs(60);
const MAX_PAIRING_ATTEMPTS_PER_WINDOW: u32 = 5;
const PAIRING_LOCKOUT: Duration = Duration::from_secs(60);
const SESSION_TTL: Duration = Duration::from_secs(15 * 60);
const MAX_ACTIVE_SESSIONS: usize = 5;
const MAX_RESOURCE_IMAGES: usize = 8;
const MAX_RESOURCE_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpBridgeStatus {
    pub enabled: bool,
    pub state: String,
    pub host: &'static str,
    pub port: u16,
    pub read_only: bool,
    pub bridge_version: &'static str,
    pub last_test_at: Option<String>,
    pub last_test_ok: Option<bool>,
    pub last_client_connected_at: Option<String>,
    pub last_error: Option<String>,
    pub has_auth_token: bool,
}

#[derive(Debug, Clone, Default)]
pub struct ActiveContext { pub entry_id: Option<String>, pub question_number: Option<String> }

#[derive(Clone)]
struct PairingAttempt {
    window_started: Instant,
    failures: u32,
    blocked_until: Option<Instant>,
}

pub struct McpBridgeManager {
    store: Arc<NotebookStore>, data_dir: PathBuf,
    active_context: Arc<Mutex<ActiveContext>>, status: Arc<Mutex<McpBridgeStatus>>,
    auth_token: Arc<Mutex<String>>, pairing_codes: Arc<Mutex<HashMap<String, Instant>>>, sessions: Arc<Mutex<HashMap<String, Instant>>>,
    pairing_attempts: Arc<Mutex<HashMap<IpAddr, PairingAttempt>>>,
    task: Mutex<Option<JoinHandle<()>>>,
}

impl McpBridgeManager {
    pub fn new(store: Arc<NotebookStore>, data_dir: PathBuf) -> Self {
        Self { store, data_dir, active_context: Arc::new(Mutex::new(ActiveContext::default())),
            status: Arc::new(Mutex::new(stopped_status())), auth_token: Arc::new(Mutex::new(String::new())),
            pairing_codes: Arc::new(Mutex::new(HashMap::new())),
            sessions: Arc::new(Mutex::new(HashMap::new())),
            pairing_attempts: Arc::new(Mutex::new(HashMap::new())), task: Mutex::new(None) }
    }
    pub fn status(&self) -> McpBridgeStatus { self.status.lock().map(|value| value.clone()).unwrap_or_else(|_| stopped_status()) }
    pub fn sync_active_context(&self, entry_id: Option<String>, question_number: Option<String>) {
        if let Ok(mut context) = self.active_context.lock() { context.entry_id = entry_id; context.question_number = question_number; }
    }
    pub async fn set_enabled(&self, enabled: bool, port: u16) -> Result<McpBridgeStatus, String> { if enabled { self.start(port).await?; } else { self.stop(); } Ok(self.status()) }
    pub fn create_pairing_code(&self) -> Result<String, String> {
        if self.status().state != "running" { return Err("로컬 MCP 브리지를 먼저 실행하세요.".into()); }
        let code = Uuid::new_v4().simple().to_string()[..12].to_ascii_uppercase();
        let mut codes = self.pairing_codes.lock().map_err(|_| "페어링 상태를 잠글 수 없습니다.".to_owned())?;
        codes.retain(|_, expires| *expires > Instant::now());
        if codes.len() >= MAX_ACTIVE_PAIRING_CODES { return Err("활성 연결 코드가 너무 많습니다. 기존 코드를 사용하거나 만료를 기다리세요.".into()); }
        codes.insert(code.clone(), Instant::now() + PAIRING_TTL);
        Ok(code)
    }
    pub fn rotate_token(&self) -> Result<(), String> {
        let token = new_token(); store_token(&token)?;
        *self.auth_token.lock().map_err(|_| "MCP 인증 상태를 잠글 수 없습니다.".to_owned())? = token;
        self.pairing_codes.lock().map_err(|_| "페어링 상태를 잠글 수 없습니다.".to_owned())?.clear();
        self.sessions.lock().map_err(|_| "MCP 세션 상태를 잠글 수 없습니다.".to_owned())?.clear();
        self.pairing_attempts.lock().map_err(|_| "페어링 상태를 잠글 수 없습니다.".to_owned())?.clear(); Ok(())
    }
    pub fn disconnect(&self) -> Result<(), String> { self.rotate_token() }
    pub async fn test(&self) -> Result<McpBridgeStatus, String> {
        let status = self.status(); if status.state != "running" { return Err("로컬 MCP 브리지가 실행 중이 아닙니다.".into()); }
        if let Ok(mut current) = self.status.lock() { current.last_test_at = Some(now_string()); current.last_test_ok = Some(false); }
        let token = self.auth_token.lock().map_err(|_| "MCP 인증 상태를 읽지 못했습니다.".to_owned())?.clone();
        let client = reqwest::Client::builder().timeout(Duration::from_secs(5)).build().map_err(|e| e.to_string())?;
        let url = format!("http://127.0.0.1:{}/mcp", status.port);
        let init = client.post(&url).header("x-wan-self-test", "1").bearer_auth(&token).json(&json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}})).send().await.map_err(|e| format!("initialize 요청 실패: {e}"))?;
        if !init.status().is_success() { return Err(format!("initialize 응답 실패: {}", init.status())); }
        let initialized = client.post(&url).header("x-wan-self-test", "1").bearer_auth(&token).json(&json!({"jsonrpc":"2.0","method":"notifications/initialized","params":{}})).send().await.map_err(|e| format!("initialized 알림 실패: {e}"))?;
        if initialized.status() != StatusCode::ACCEPTED || initialized.content_length().unwrap_or(0) != 0 { return Err("initialized 알림이 202 빈 응답이 아닙니다.".into()); }
        let tools = client.post(&url).header("x-wan-self-test", "1").bearer_auth(&token).json(&json!({"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}})).send().await.map_err(|e| format!("tools/list 요청 실패: {e}"))?.json::<Value>().await.map_err(|e| e.to_string())?;
        if tools.pointer("/result/tools").and_then(Value::as_array).map_or(0, Vec::len) != 5 { return Err("tools/list 응답을 검증하지 못했습니다.".into()); }
        let health = client.post(&url).header("x-wan-self-test", "1").bearer_auth(&token).json(&json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"health_check","arguments":{}}})).send().await.map_err(|e| format!("health_check 요청 실패: {e}"))?.json::<Value>().await.map_err(|e| e.to_string())?;
        if !health.to_string().contains("\"ok\":true") { return Err("health_check 응답을 검증하지 못했습니다.".into()); }
        if let Ok(mut current) = self.status.lock() { current.last_test_ok = Some(true); }
        Ok(self.status())
    }
    async fn start(&self, port: u16) -> Result<(), String> {
        if self.status().state == "running" && self.status().port == port { return Ok(()); }
        // Bind before stopping the old listener so a failed port change is non-destructive.
        let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
        let listener = tokio::net::TcpListener::bind(address).await.map_err(|error| format!("로컬 MCP 포트 {port}를 열지 못했습니다: {error}"))?;
        let token = self.auth_token.lock().map_err(|_| "MCP 인증 상태를 잠글 수 없습니다.".to_owned())?.clone();
        let token = if token.trim().is_empty() { load_or_create_token()? } else { token };
        *self.auth_token.lock().map_err(|_| "MCP 인증 상태를 잠글 수 없습니다.".to_owned())? = token;
        let state = BridgeHttpState { store: Arc::clone(&self.store), images_path: self.store.images_path().to_path_buf(), auth_token: Arc::clone(&self.auth_token), pairing_codes: Arc::clone(&self.pairing_codes), sessions: Arc::clone(&self.sessions), pairing_attempts: Arc::clone(&self.pairing_attempts), active_context: Arc::clone(&self.active_context), status: Arc::clone(&self.status), audit_path: self.data_dir.join("mcp-audit.jsonl") };
        let app = router(state);
        let new_task = tauri::async_runtime::spawn(async move { if let Err(error) = axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await { eprintln!("local MCP bridge stopped: {error}"); } });
        if let Ok(mut task) = self.task.lock() { if let Some(old) = task.replace(new_task) { old.abort(); } }
        if let Ok(mut status) = self.status.lock() { *status = McpBridgeStatus { enabled: true, state: "running".into(), host: "127.0.0.1", port, read_only: true, bridge_version: MCP_BRIDGE_VERSION, last_test_at: None, last_test_ok: None, last_client_connected_at: None, last_error: None, has_auth_token: true }; }
        Ok(())
    }
    fn stop(&self) { if let Ok(mut task) = self.task.lock() { if let Some(handle) = task.take() { handle.abort(); } } if let Ok(mut status) = self.status.lock() { *status = stopped_status(); } }
}
impl Drop for McpBridgeManager { fn drop(&mut self) { self.stop(); } }
#[cfg(test)]
impl McpBridgeManager {
    fn new_for_test(store: Arc<NotebookStore>, data_dir: PathBuf, token: &str) -> Self {
        let manager = Self::new(store, data_dir);
        *manager.auth_token.lock().expect("test token lock") = token.to_owned();
        manager
    }
}
fn stopped_status() -> McpBridgeStatus { McpBridgeStatus { enabled:false, state:"stopped".into(), host:"127.0.0.1", port:DEFAULT_MCP_PORT, read_only:true, bridge_version:MCP_BRIDGE_VERSION, last_test_at:None, last_test_ok:None, last_client_connected_at:None, last_error:None, has_auth_token:false } }
fn new_token() -> String { format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple()) }
fn keyring_entry() -> Result<KeyringEntry, String> { KeyringEntry::new(MCP_KEYRING_SERVICE, MCP_KEYRING_USER).map_err(|e| format!("MCP 인증 저장소를 열지 못했습니다: {e}")) }
fn store_token(token: &str) -> Result<(), String> { keyring_entry()?.set_password(token).map_err(|e| format!("MCP 인증 토큰을 저장하지 못했습니다: {e}")) }
fn load_or_create_token() -> Result<String, String> { let entry=keyring_entry()?; if let Ok(token)=entry.get_password() { if !token.trim().is_empty() { return Ok(token); } } let token=new_token(); entry.set_password(&token).map_err(|e| format!("MCP 인증 토큰을 저장하지 못했습니다: {e}"))?; Ok(token) }

#[derive(Clone)]
struct BridgeHttpState { store: Arc<NotebookStore>, images_path: PathBuf, auth_token: Arc<Mutex<String>>, pairing_codes: Arc<Mutex<HashMap<String, Instant>>>, sessions: Arc<Mutex<HashMap<String, Instant>>>, pairing_attempts: Arc<Mutex<HashMap<IpAddr, PairingAttempt>>>, active_context: Arc<Mutex<ActiveContext>>, status: Arc<Mutex<McpBridgeStatus>>, audit_path: PathBuf }
fn router(state: BridgeHttpState) -> Router { Router::new().route("/mcp", post(mcp_post).get(mcp_get)).route("/pair", post(redeem_pairing)).layer(axum::extract::DefaultBodyLimit::max(1024 * 1024)).with_state(state) }

async fn redeem_pairing(State(state): State<BridgeHttpState>, ConnectInfo(peer): ConnectInfo<SocketAddr>, headers: HeaderMap, Json(body): Json<Value>) -> Response {
    if !origin_allowed(&headers) { return (StatusCode::FORBIDDEN, "허용되지 않은 Origin입니다.").into_response(); }
    let now = Instant::now();
    let blocked = state.pairing_attempts.lock().ok().map(|mut attempts| {
        attempts.retain(|_, attempt| attempt.window_started + PAIRING_WINDOW > now || attempt.blocked_until.is_some_and(|until| until > now));
        let attempt = attempts.entry(peer.ip()).or_insert(PairingAttempt { window_started: now, failures: 0, blocked_until: None });
        if attempt.blocked_until.is_some_and(|until| until > now) { return true; }
        if attempt.window_started + PAIRING_WINDOW <= now { attempt.window_started = now; attempt.failures = 0; attempt.blocked_until = None; }
        false
    }).unwrap_or(true);
    if blocked { audit(&state, "pairing/redeem", Duration::ZERO, false, 0, Some(429)); return (StatusCode::TOO_MANY_REQUESTS,"페어링 시도가 너무 많습니다. 잠시 후 다시 시도하세요.").into_response(); }
    let code=body.get("code").and_then(Value::as_str).unwrap_or_default(); let valid=state.pairing_codes.lock().ok().and_then(|mut codes| { codes.retain(|_, expires| *expires > now); codes.remove(code) }).is_some();
    if !valid {
        if let Ok(mut attempts) = state.pairing_attempts.lock() { if let Some(attempt) = attempts.get_mut(&peer.ip()) { attempt.failures += 1; if attempt.failures >= MAX_PAIRING_ATTEMPTS_PER_WINDOW { attempt.blocked_until = Some(now + PAIRING_LOCKOUT); } } }
        audit(&state, "pairing/redeem", Duration::ZERO, false, 0, Some(401));
        tokio::time::sleep(Duration::from_millis(150)).await;
        return (StatusCode::UNAUTHORIZED,"유효하지 않거나 만료된 페어링 코드입니다.").into_response();
    }
    if let Ok(mut attempts) = state.pairing_attempts.lock() { attempts.remove(&peer.ip()); }
    let token = new_token();
    let mut sessions = match state.sessions.lock() {
        Ok(value) => value,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "MCP 세션 상태를 잠글 수 없습니다.").into_response(),
    };
    sessions.retain(|_, expires| *expires > now);
    if sessions.len() >= MAX_ACTIVE_SESSIONS {
        audit(&state, "pairing/redeem", Duration::ZERO, false, 0, Some(429));
        return (StatusCode::TOO_MANY_REQUESTS, "활성 MCP 세션이 너무 많습니다.").into_response();
    }
    sessions.insert(token.clone(), now + SESSION_TTL);
    audit(&state, "pairing/redeem", Duration::ZERO, true, 1, None);
    Json(json!({"accessToken":token,"tokenType":"Bearer"})).into_response()
}
async fn mcp_get(State(state): State<BridgeHttpState>, headers: HeaderMap) -> Response { if let Err(response)=authorize(&state,&headers) { return response; } (StatusCode::METHOD_NOT_ALLOWED, [(header::ALLOW,"POST")], Body::empty()).into_response() }
async fn mcp_post(State(state): State<BridgeHttpState>, request: Request<Body>) -> Response {
    let (parts,body)=request.into_parts(); if let Err(response)=authorize(&state,&parts.headers) { return response; }
    let bytes=match axum::body::to_bytes(body,1024*1024).await { Ok(value)=>value, Err(_)=>return rpc_error(Value::Null,-32600,"요청 본문이 너무 큽니다.") };
    let raw: Value=match serde_json::from_slice(&bytes) { Ok(value)=>value, Err(_)=>return rpc_error(Value::Null,-32700,"JSON-RPC 요청을 읽지 못했습니다.") };
    let requests=match raw { Value::Array(values) if !values.is_empty()=>values, Value::Array(_)=>return rpc_error(Value::Null,-32600,"빈 JSON-RPC 배치는 허용되지 않습니다."), value=>vec![value] };
    let mut responses=Vec::new(); let mut any_request=false;
    for value in requests { let has_id=value.get("id").is_some(); let mut rpc:RpcRequest=match serde_json::from_value(value) { Ok(value)=>value, Err(_)=>{responses.push(error_value(Value::Null,-32600,"잘못된 JSON-RPC 요청입니다.")); continue;} }; rpc.has_id=has_id;
        if rpc.jsonrpc!="2.0" || rpc.method.trim().is_empty() { responses.push(error_value(rpc.id.clone(),-32600,"잘못된 JSON-RPC 요청입니다.")); continue; }
        let notification=!rpc.has_id; let id=rpc.id.clone(); let tool_name=rpc.params.get("name").and_then(Value::as_str).unwrap_or(&rpc.method).to_owned(); let started=Instant::now();
        let result=dispatch(&state,&rpc).await; let (success,count,code)=match &result { Ok((_,count))=>(true,*count,None), Err((code,_))=>(false,0,Some(*code)) }; audit(&state,&tool_name,started.elapsed(),success,count,code);
        if !notification { any_request=true; responses.push(match result { Ok((value,_))=>json!({"jsonrpc":"2.0","id":id,"result":value}), Err((code,message))=>error_value(id,code,&message) }); }
    }
    if !any_request { return (StatusCode::ACCEPTED, Body::empty()).into_response(); }
    let output=if responses.len()==1 { responses.remove(0) } else { Value::Array(responses) }; Json(output).into_response()
}
fn authorize(state:&BridgeHttpState, headers:&HeaderMap)->Result<(),Response> {
    if !origin_allowed(headers) { return Err((StatusCode::FORBIDDEN,"허용되지 않은 Origin입니다.").into_response()); }
    let Some(value) = headers.get(header::AUTHORIZATION).and_then(|value| value.to_str().ok()) else { return Err((StatusCode::UNAUTHORIZED,"인증이 필요합니다.").into_response()); };
    let Some(token) = value.strip_prefix("Bearer ") else { return Err((StatusCode::UNAUTHORIZED,"인증이 필요합니다.").into_response()); };
    let self_test = headers.get("x-wan-self-test").and_then(|value| value.to_str().ok()) == Some("1");
    let authorized = if self_test {
        state.auth_token.lock().map(|value| value == token).unwrap_or(false)
    } else {
        state.sessions.lock().map(|mut sessions| {
            sessions.retain(|_, expires| *expires > Instant::now());
            sessions.contains_key(token)
        }).unwrap_or(false)
    };
    if !authorized { return Err((StatusCode::UNAUTHORIZED,"인증이 필요합니다.").into_response()); }
    if !self_test { if let Ok(mut status)=state.status.lock(){status.last_client_connected_at=Some(now_string());} }
    Ok(())
}
fn origin_allowed(headers: &HeaderMap) -> bool {
    let Some(origin) = headers.get(header::ORIGIN).and_then(|value| value.to_str().ok()) else { return true; };
    let Ok(url) = reqwest::Url::parse(origin) else { return false; };
    url.scheme() == "http" && matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "::1"))
}
#[derive(Deserialize)] struct RpcRequest { jsonrpc:String, #[serde(default)] id:Value, method:String, #[serde(default)] params:Value, #[serde(skip)] has_id:bool }
async fn dispatch(state:&BridgeHttpState,rpc:&RpcRequest)->Result<(Value,usize),(i32,String)> { match rpc.method.as_str() {
    "initialize"=>{ let requested=rpc.params.get("protocolVersion").and_then(Value::as_str).unwrap_or("2025-03-26"); let protocol=if matches!(requested,"2025-03-26"|"2025-06-18"){requested}else{"2025-03-26"}; Ok((json!({"protocolVersion":protocol,"serverInfo":{"name":"wrong-answer-notebook","version":MCP_BRIDGE_VERSION},"capabilities":{"tools":{},"resources":{}}}),0)) },
    "notifications/initialized"=>Ok((json!({}),0)), "tools/list"=>Ok((json!({"tools":tool_definitions()}),5)), "resources/list"=>resources_list(state,&rpc.params), "resources/read"=>resource_read(state,&rpc.params), "tools/call"=>call_tool(state,&rpc.params), _=>Err((-32601,"지원하지 않는 MCP 메서드입니다.".into())) } }
fn schema(properties:Value,required:&[&str])->Value { json!({"type":"object","properties":properties,"required":required,"additionalProperties":false}) }
fn tool(name:&str,description:&str,input_schema:Value)->Value { json!({"name":name,"description":description,"inputSchema":input_schema,"annotations":{"readOnlyHint":true}}) }
fn tool_definitions()->Vec<Value>{vec![
 tool("health_check","로컬 읽기 전용 노트 상태를 확인합니다.",schema(json!({}),&[])),
 tool("search_notebook","노트를 검색합니다.",schema(json!({"query":{"type":"string"},"subject":{"type":"string"},"entryKind":{"type":"string","enum":["wrong_answer","problem_sheet","concept","lecture"]},"limit":{"type":"integer","minimum":1,"maximum":50,"default":20}}),&[])),
 tool("get_entry","항목을 읽습니다. 정답과 해설은 명시 요청 시에만 포함합니다.",schema(json!({"entryId":{"type":"string","minLength":1},"includeAnswers":{"type":"boolean","default":false},"includeExplanations":{"type":"boolean","default":false},"includeReview":{"type":"boolean","default":false}}),&["entryId"])),
 tool("get_question","시험지 문항을 읽습니다.",schema(json!({"entryId":{"type":"string","minLength":1},"questionNumber":{"type":"string","minLength":1},"includeAnswer":{"type":"boolean","default":false},"includeExplanation":{"type":"boolean","default":false},"includeImages":{"type":"boolean","default":false},"includeReview":{"type":"boolean","default":false}}),&["entryId","questionNumber"])),
 tool("get_active_question","현재 앱에서 보고 있는 문항을 읽습니다.",schema(json!({"includeAnswer":{"type":"boolean","default":false},"includeExplanation":{"type":"boolean","default":false},"includeImages":{"type":"boolean","default":false},"includeReview":{"type":"boolean","default":false}}),&[])),
]}
fn call_tool(state:&BridgeHttpState,params:&Value)->Result<(Value,usize),(i32,String)>{let name=params.get("name").and_then(Value::as_str).ok_or((-32602,"도구 이름이 필요합니다.".to_owned()))?;let args=params.get("arguments").cloned().unwrap_or_else(||json!({}));let payload=match name {"health_check"=>json!({"ok":true,"readOnly":true,"entryCount":state.store.load_entries().map_err(store_error)?.len(),"version":MCP_BRIDGE_VERSION}),"search_notebook"=>search_payload(state,&args)?,"get_entry"=>entry_payload(state,&args)?,"get_question"=>question_payload(state,&args)?,"get_active_question"=>active_question_payload(state,&args)?,_=>return Err((-32601,"읽기 전용 MCP 도구만 사용할 수 있습니다.".into()))};let count=payload.get("items").and_then(Value::as_array).map_or(1,Vec::len);Ok((json!({"content":[{"type":"text","text":serde_json::to_string(&payload).map_err(|_|(-32603,"응답을 만들지 못했습니다.".to_owned()))?}]}),count))}
fn valid_entry_kind(value:&str)->bool{matches!(value,"wrong_answer"|"problem_sheet"|"concept"|"lecture")}
fn search_payload(state:&BridgeHttpState,args:&Value)->Result<Value,(i32,String)>{let query=args.get("query").and_then(Value::as_str).unwrap_or("");let subject=args.get("subject").and_then(Value::as_str);let entry_kind=args.get("entryKind").and_then(Value::as_str);if entry_kind.is_some_and(|value|!valid_entry_kind(value)){return Err((-32602,"entryKind 값이 올바르지 않습니다.".into()));}let limit=args.get("limit").and_then(Value::as_u64).unwrap_or(20);if !(1..=50).contains(&limit){return Err((-32602,"limit은 1~50이어야 합니다.".into()));}let entries=state.store.search(SearchQuery{query,subject,entry_kind,limit:limit as usize}).map_err(store_error)?;Ok(json!({"items":entries.into_iter().map(|entry|json!({"entryId":entry.id,"title":entry.title,"subject":entry.subject,"entryKind":entry.entry_kind,"updatedAt":entry.updated_at,"questionCount":crate::notebook_store::parse_question_blocks(&entry.question).len(),"matchedSnippet":matched_snippet(&entry,query,220)})).collect::<Vec<_>>() }))}
fn entry_payload(state:&BridgeHttpState,args:&Value)->Result<Value,(i32,String)>{let entry_id=args.get("entryId").and_then(Value::as_str).filter(|value|!value.is_empty()).ok_or((-32602,"entryId가 필요합니다.".to_owned()))?;let entry=state.store.get_entry(entry_id).map_err(store_error)?.ok_or((-32004,"항목을 찾지 못했습니다.".to_owned()))?;let answers=args.get("includeAnswers").and_then(Value::as_bool).unwrap_or(false);let explanations=args.get("includeExplanations").and_then(Value::as_bool).unwrap_or(false);let review=args.get("includeReview").and_then(Value::as_bool).unwrap_or(false);let mut item=json!({"entryId":entry.id,"title":entry.title,"subject":entry.subject,"entryKind":entry.entry_kind,"question":entry.question,"tags":entry.tags,"updatedAt":entry.updated_at});if answers{item["correctAnswer"]=Value::String(entry.correct_answer);item["answerKey"]=Value::Array(entry.answer_key.clone());}if explanations{item["explanation"]=Value::String(entry.explanation);item["explanationParts"]=serde_json::to_value(entry.explanation_parts).unwrap_or(Value::Null);}if review{item["review"]=entry.review.unwrap_or(Value::Null);}Ok(item)}
fn question_payload(state:&BridgeHttpState,args:&Value)->Result<Value,(i32,String)>{let entry_id=args.get("entryId").and_then(Value::as_str).filter(|value|!value.is_empty()).ok_or((-32602,"entryId가 필요합니다.".to_owned()))?;let number=args.get("questionNumber").and_then(Value::as_str).filter(|value|!value.is_empty()).ok_or((-32602,"questionNumber가 필요합니다.".to_owned()))?;let entry=state.store.get_entry(entry_id).map_err(store_error)?.ok_or((-32004,"문항을 찾지 못했습니다.".to_owned()))?;let answer=args.get("includeAnswer").and_then(Value::as_bool).unwrap_or(false);let explanation=args.get("includeExplanation").and_then(Value::as_bool).unwrap_or(false);let include_review=args.get("includeReview").and_then(Value::as_bool).unwrap_or(false);let include_images=args.get("includeImages").and_then(Value::as_bool).unwrap_or(false);if entry.entry_kind=="wrong_answer"{let mut item=json!({"entryId":entry.id,"questionNumber":number,"question":entry.question,"choices":[]});if answer{item["correctAnswer"]=Value::String(entry.correct_answer);}if explanation{item["explanation"]=Value::String(entry.explanation);item["explanationParts"]=serde_json::to_value(entry.explanation_parts).unwrap_or(Value::Null);}if include_review{item["review"]=entry.review.unwrap_or(Value::Null);}if include_images{item["questionImages"]=image_resources_for_entry(state,&entry,None);}return Ok(item);}let question=state.store.get_question(entry_id,number).map_err(store_error)?.ok_or((-32004,"문항을 찾지 못했습니다.".to_owned()))?;let mut item=json!({"entryId":question.entry.id,"questionNumber":question.question_number,"question":question.body,"choices":question.choices});if let Some(answer_key)=question.answer_key{if answer{item["answer"]=answer_key.get("answer").cloned().unwrap_or(Value::Null);}if explanation{item["explanation"]=answer_key.get("explanation").cloned().unwrap_or(Value::Null);}}if include_review{item["review"]=question_review(&question.entry,&question.question_number);}if include_images{item["images"]=image_resources(state,&question.entry,&question.question_number);}Ok(item)}
fn question_review(entry:&crate::WrongAnswerEntry,question_number:&str)->Value{let wanted=normalize_question_number(question_number);entry.extra.get("questionMeta").and_then(Value::as_array).and_then(|items|items.iter().find(|item|item.get("questionNumber").and_then(Value::as_str).is_some_and(|number|normalize_question_number(number)==wanted))).and_then(|item|item.get("review")).cloned().unwrap_or(Value::Null)}
fn image_resources_for_entry(state:&BridgeHttpState,entry:&crate::WrongAnswerEntry,question_number:Option<&str>)->Value{let mut names=entry.question_images.clone();if let Some(number)=question_number{let wanted=normalize_question_number(number);names.extend(entry.figures.iter().filter(|figure|normalize_question_number(&figure.question_number)==wanted).filter_map(|figure|figure.image.clone()));}names.sort();names.dedup();let mut total=0u64;Value::Array(names.into_iter().filter_map(|filename|{if namesafe_image(&state.images_path,&filename).ok()?{let size=fs::metadata(state.images_path.join(&filename)).ok()?.len();if total.checked_add(size)? > MAX_RESOURCE_BYTES{return None;}total+=size;Some(json!({"uri":resource_uri(&entry.id,&filename),"name":filename,"mimeType":mime_for(&filename).ok()?}))}else{None}}).take(MAX_RESOURCE_IMAGES).collect())}
fn active_question_payload(state:&BridgeHttpState,args:&Value)->Result<Value,(i32,String)>{let context=state.active_context.lock().map_err(|_|(-32603,"현재 문항 상태를 읽지 못했습니다.".to_owned()))?.clone();let Some(entry_id)=context.entry_id else{return Ok(json!({"active":false,"message":"앱에서 선택한 문항이 없습니다."}));};let entry=state.store.get_entry(&entry_id).map_err(store_error)?.ok_or((-32004,"항목을 찾지 못했습니다.".to_owned()))?;let number=context.question_number.unwrap_or_default();if number.is_empty()&&entry.entry_kind!="wrong_answer"{return Ok(json!({"active":false,"entryId":entry_id,"message":"현재 항목에 선택된 문항이 없습니다."}));}let mut next=args.clone();next["entryId"]=Value::String(entry_id);if !number.is_empty(){next["questionNumber"]=Value::String(number);}else{next["questionNumber"]=Value::String("active".into());}question_payload(state,&next)}
fn image_resources(state:&BridgeHttpState,entry:&crate::WrongAnswerEntry,question_number:&str)->Value{let normalized=normalize_question_number(question_number);let mut names=entry.figures.iter().filter(|figure|normalize_question_number(&figure.question_number)==normalized).filter_map(|figure|figure.image.clone()).collect::<Vec<_>>();names.sort();names.dedup();let mut total=0u64;let items=names.into_iter().filter_map(|filename|{if namesafe_image(&state.images_path,&filename).ok()? {let size=fs::metadata(state.images_path.join(&filename)).ok()?.len();if total.checked_add(size)? > MAX_RESOURCE_BYTES{return None;}total+=size;Some(json!({"uri":resource_uri(&entry.id,&filename),"name":filename,"mimeType":mime_for(&filename).ok()?}))}else{None}}).take(MAX_RESOURCE_IMAGES).collect::<Vec<_>>();Value::Array(items)}
fn resources_list(state:&BridgeHttpState,args:&Value)->Result<(Value,usize),(i32,String)>{let entry_id=args.get("entryId").and_then(Value::as_str);let question=args.get("questionNumber").and_then(Value::as_str);let mut resources=Vec::new();if let(Some(entry_id),Some(question))=(entry_id,question){let entry=state.store.get_entry(entry_id).map_err(store_error)?.ok_or((-32004,"항목을 찾지 못했습니다.".to_owned()))?;resources=image_resources(state,&entry,question).as_array().cloned().unwrap_or_default();}let count=resources.len();Ok((json!({"resources":resources}),count))}
fn resource_read(state:&BridgeHttpState,args:&Value)->Result<(Value,usize),(i32,String)>{let uri=args.get("uri").and_then(Value::as_str).ok_or((-32602,"uri가 필요합니다.".to_owned()))?;let Some((entry_id,filename))=parse_resource_uri(uri)else{return Err((-32602,"지원하지 않는 이미지 URI입니다.".into()));};let entry=state.store.get_entry(entry_id).map_err(store_error)?.ok_or((-32004,"항목을 찾지 못했습니다.".to_owned()))?;let listed=entry.question_images.iter().any(|item|item==filename)||entry.figures.iter().any(|figure|figure.image.as_deref()==Some(filename));if !listed{return Err((-32004,"이미지 리소스를 찾지 못했습니다.".into()));}if !namesafe_image(&state.images_path,filename).map_err(store_error)?{return Err((-32004,"이미지 리소스를 찾지 못했습니다.".into()));}let path=state.images_path.join(filename);let bytes=fs::read(path).map_err(|error| store_error(error.to_string()))?;let mime=mime_for(filename).map_err(store_error)?;Ok((json!({"contents":[{"uri":uri,"mimeType":mime,"blob":BASE64_STANDARD.encode(bytes)}]}),1))}
fn resource_uri(entry_id:&str,filename:&str)->String{format!("notebook-image://entry/{entry_id}/{filename}")}
fn parse_resource_uri(uri:&str)->Option<(&str,&str)>{let value=uri.strip_prefix("notebook-image://entry/")?;let (entry,filename)=value.split_once('/')?;if entry.is_empty()||filename.is_empty()||filename.contains('/')||filename.contains('\\'){None}else{Some((entry,filename))}}
fn namesafe_image(images:&Path,filename:&str)->Result<bool,String>{if filename.is_empty()||filename.contains("..")||filename.contains('/')||filename.contains('\\'){return Ok(false);}let path=images.join(filename);let metadata=match fs::metadata(&path){Ok(value)=>value,Err(_)=>return Ok(false)};if metadata.len()>MAX_RESOURCE_BYTES{return Ok(false);}let ext=Path::new(filename).extension().and_then(|value|value.to_str()).unwrap_or_default();let mut file=fs::File::open(path).map_err(|e|e.to_string())?;let mut header=[0u8;12];let read=file.read(&mut header).map_err(|e|e.to_string())?;Ok(valid_image_header(&header[..read],ext)&&mime_for(filename).is_ok())}
fn valid_image_header(bytes:&[u8],ext:&str)->bool{match ext.to_ascii_lowercase().as_str(){"png"=>bytes.len()>=8&&bytes[..8]==[0x89,b'P',b'N',b'G',0x0d,0x0a,0x1a,0x0a],"jpg"|"jpeg"=>bytes.len()>=3&&bytes[0]==0xff&&bytes[1]==0xd8&&bytes[2]==0xff,"webp"=>bytes.len()>=12&&&bytes[..4]==b"RIFF"&&&bytes[8..12]==b"WEBP",_=>false}}
fn mime_for(filename:&str)->Result<&'static str,String>{match Path::new(filename).extension().and_then(|value|value.to_str()).unwrap_or_default().to_ascii_lowercase().as_str(){"png"=>Ok("image/png"),"jpg"|"jpeg"=>Ok("image/jpeg"),"webp"=>Ok("image/webp"),_=>Err("지원하지 않는 이미지 형식입니다.".into())}}
fn store_error(error:String)->(i32,String){(-32000,error)} fn error_value(id:Value,code:i32,message:&str)->Value{json!({"jsonrpc":"2.0","id":id,"error":{"code":code,"message":message}})} fn rpc_error(id:Value,code:i32,message:&str)->Response{Json(error_value(id,code,message)).into_response()} fn now_string()->String{std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|value|value.as_secs().to_string()).unwrap_or_else(|_|"0".into())}
fn audit(state:&BridgeHttpState,tool:&str,duration:Duration,success:bool,result_count:usize,error_code:Option<i32>){if let Some(parent)=state.audit_path.parent(){let _=fs::create_dir_all(parent);}if state.audit_path.metadata().map(|meta|meta.len()>1_000_000).unwrap_or(false){let _=fs::rename(&state.audit_path,state.audit_path.with_extension("jsonl.1"));}if let Ok(mut file)=OpenOptions::new().create(true).append(true).open(&state.audit_path){let _=writeln!(file,"{}",json!({"time":now_string(),"tool":tool,"durationMs":duration.as_millis() as u64,"success":success,"resultCount":result_count,"errorCode":error_code}));}}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{SheetFigureItem, WrongAnswerEntry};
    use tempfile::tempdir;

    fn sample_entry() -> WrongAnswerEntry {
        WrongAnswerEntry { id:"sheet-1".into(), subject:"수학".into(), title:"시험지".into(), question:"[문제 1] 본문\n① 가\n[문제 2] 둘째".into(), question_images:vec!["q1.png".into()], entry_kind:"problem_sheet".into(), difficult:false, difficulty:"medium".into(), my_answer:String::new(), correct_answer:String::new(), explanation:String::new(), explanation_images:vec![], explanation_parts:vec![], memo:String::new(), annotations:vec![], tags:vec!["극한".into()], answer_key:vec![json!({"questionNumber":"1","answer":"1","explanation":"해설","concepts":["함수"]})], figures:vec![SheetFigureItem{id:"f1".into(),question_number:"1".into(),title:"그래프".into(),caption:"그래프 설명".into(),image:Some("q1.png".into()),source:"original".into(),needs_review:None,extra:serde_json::Map::new()}], import_audit:None,rejected_notes:vec![],review:Some(json!({"phase":"archived"})),checklist:vec![],images:vec![],created_at:"1".into(),updated_at:"2".into(),mastered:false,extra:serde_json::Map::from_iter([(String::from("questionMeta"),json!([{ "questionNumber":"1","review":{"phase":"learning"}}]))]) }
    }
    fn png() -> Vec<u8> { vec![0x89,b'P',b'N',b'G',0x0d,0x0a,0x1a,0x0a,0,0,0,0] }
    async fn start_test_server() -> (tempfile::TempDir, McpBridgeManager, u16) {
        let dir=tempdir().unwrap(); let images=dir.path().join("images"); fs::create_dir_all(&images).unwrap(); fs::write(images.join("q1.png"),png()).unwrap();
        let store=Arc::new(NotebookStore::new(dir.path().join("entries.json"),images)); store.save_entries(&[sample_entry()]).unwrap();
        let socket=std::net::TcpListener::bind("127.0.0.1:0").unwrap(); let port=socket.local_addr().unwrap().port(); drop(socket);
        let manager=McpBridgeManager::new_for_test(store,dir.path().to_path_buf(),"test-token"); manager.start(port).await.unwrap(); tokio::time::sleep(Duration::from_millis(20)).await; (dir,manager,port)
    }
    fn request(id:Option<u64>,method:&str,params:Value)->Value { let mut value=json!({"jsonrpc":"2.0","method":method,"params":params}); if let Some(id)=id { value["id"]=json!(id); } value }
    #[tokio::test]
    async fn actual_streamable_http_round_trip_enforces_protocol_and_is_read_only() {
        let (_dir,manager,port)=start_test_server().await; let url=format!("http://127.0.0.1:{port}/mcp"); let client=reqwest::Client::new();
        assert_eq!(client.post(&url).json(&request(Some(1),"initialize",json!({"protocolVersion":"2025-03-26"}))).send().await.unwrap().status(),StatusCode::UNAUTHORIZED);
        assert_eq!(client.post(&url).bearer_auth("wrong").json(&request(Some(1),"initialize",json!({}))).send().await.unwrap().status(),StatusCode::UNAUTHORIZED);
        assert_eq!(client.post(&url).bearer_auth("test-token").header(header::ORIGIN,"http://127.0.0.1.evil.example").json(&request(Some(1),"initialize",json!({}))).send().await.unwrap().status(),StatusCode::FORBIDDEN);
        let entries_before=fs::read(manager.store.entries_path()).unwrap();
        let init=client.post(&url).bearer_auth("test-token").json(&request(Some(1),"initialize",json!({"protocolVersion":"2025-03-26"}))).send().await.unwrap().json::<Value>().await.unwrap(); assert_eq!(init["result"]["protocolVersion"],"2025-03-26");
        let notification=client.post(&url).bearer_auth("test-token").json(&request(None,"notifications/initialized",json!({}))).send().await.unwrap(); assert_eq!(notification.status(),StatusCode::ACCEPTED); assert_eq!(notification.bytes().await.unwrap().len(),0);
        assert_eq!(client.get(&url).bearer_auth("test-token").send().await.unwrap().status(),StatusCode::METHOD_NOT_ALLOWED);
        let tools=client.post(&url).bearer_auth("test-token").json(&request(Some(2),"tools/list",json!({}))).send().await.unwrap().json::<Value>().await.unwrap(); let tools=tools["result"]["tools"].as_array().unwrap(); assert_eq!(tools.len(),5); assert!(tools.iter().all(|tool|tool.get("inputSchema").is_some()&&tool["annotations"]["readOnlyHint"]==true));
        let question=client.post(&url).bearer_auth("test-token").json(&request(Some(3),"tools/call",json!({"name":"get_question","arguments":{"entryId":"sheet-1","questionNumber":"1","includeReview":true,"includeImages":true}}))).send().await.unwrap().json::<Value>().await.unwrap(); let text=question["result"]["content"][0]["text"].as_str().unwrap(); assert!(text.contains("learning")); assert!(text.contains("notebook-image://entry/sheet-1/q1.png")); assert!(!text.contains("해설"));
        let image=client.post(&url).bearer_auth("test-token").json(&request(Some(4),"resources/read",json!({"uri":"notebook-image://entry/sheet-1/q1.png"}))).send().await.unwrap().json::<Value>().await.unwrap(); assert_eq!(image["result"]["contents"][0]["mimeType"],"image/png"); assert!(image["result"]["contents"][0].get("blob").is_some());
        let search=client.post(&url).bearer_auth("test-token").json(&request(Some(5),"tools/call",json!({"name":"search_notebook","arguments":{"query":"함수","entryKind":"problem_sheet","limit":1}}))).send().await.unwrap().json::<Value>().await.unwrap(); assert!(search.to_string().contains("entryId")); assert!(search.to_string().contains("matchedSnippet"));
        assert_eq!(fs::read(manager.store.entries_path()).unwrap(),entries_before); manager.stop();
    }
    #[tokio::test]
    async fn port_change_keeps_existing_server_when_new_port_cannot_bind() {
        let (_dir,manager,port)=start_test_server().await; let blocked=std::net::TcpListener::bind("127.0.0.1:0").unwrap(); let blocked_port=blocked.local_addr().unwrap().port(); assert!(manager.start(blocked_port).await.is_err()); assert_eq!(manager.status().port,port); manager.stop();
    }

    #[tokio::test]
    async fn self_test_updates_test_status_without_faking_external_client_activity() {
        let (_dir, manager, _port) = start_test_server().await;
        manager.test().await.unwrap();
        let status = manager.status();
        assert_eq!(status.last_test_ok, Some(true));
        assert!(status.last_test_at.is_some());
        assert!(status.last_client_connected_at.is_none());
        manager.stop();
    }

    #[tokio::test]
    async fn pairing_codes_are_single_use_and_rate_limited() {
        let (_dir, manager, port) = start_test_server().await;
        let client = reqwest::Client::new();
        let pair_url = format!("http://127.0.0.1:{port}/pair");
        let code = manager.create_pairing_code().unwrap();
        assert_eq!(client.post(&pair_url).json(&json!({"code": code})).send().await.unwrap().status(), StatusCode::OK);
        assert_eq!(client.post(&pair_url).json(&json!({"code": code})).send().await.unwrap().status(), StatusCode::UNAUTHORIZED);
        for _ in 0..4 { assert_eq!(client.post(&pair_url).json(&json!({"code":"wrong"})).send().await.unwrap().status(), StatusCode::UNAUTHORIZED); }
        assert_eq!(client.post(&pair_url).json(&json!({"code":"wrong"})).send().await.unwrap().status(), StatusCode::TOO_MANY_REQUESTS);
        manager.stop();
    }
}
