use crate::{
    exam_submission::{self, ExamSubmissionTransactionInput},
    notebook_store::NotebookStore,
    storage::{write_bytes_atomic, write_json_atomic},
    validate_persistent_store_value,
};
use axum::{
    body::Body,
    extract::{Path as AxumPath, Request, State},
    http::{header, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use fs2::FileExt;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    env,
    fs::{self, OpenOptions},
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::{Component, Path, PathBuf},
    sync::Arc,
    time::{Duration, SystemTime},
};

const EXACT_ORIGIN: &str = "http://127.0.0.1:1420";
const STORE_NAMES: &[&str] = &[
    "entries",
    "settings",
    "exam-sessions",
    "generated-exams",
    "library-folders",
    "gpt-solution-drafts",
    "review-sessions",
    "pending-deletions",
    "import-workspace-draft",
];
const IMPORT_ASSET_SESSION_MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Clone)]
struct BridgeState {
    data_dir: PathBuf,
    token: String,
    store: Arc<NotebookStore>,
}

type BridgeResult<T> = Result<T, (StatusCode, String)>;

fn internal(error: impl ToString) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
}

fn invalid(error: impl ToString) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, error.to_string())
}

fn store_path(root: &Path, name: &str) -> BridgeResult<PathBuf> {
    let filename = match name {
        "settings" => "settings.json",
        "exam-sessions" => "exam-sessions.json",
        "generated-exams" => "generated-exams.json",
        "library-folders" => "library-folders.json",
        "gpt-solution-drafts" => "gpt-solution-drafts.json",
        "review-sessions" => "review-sessions.json",
        "pending-deletions" => "pending-deletions.json",
        "import-workspace-draft" => "import-workspace-draft.json",
        "entries" => "entries.json",
        _ => return Err((StatusCode::NOT_FOUND, "알 수 없는 저장소입니다.".into())),
    };
    Ok(root.join(filename))
}

fn with_file_lock<T>(root: &Path, operation: impl FnOnce() -> BridgeResult<T>) -> BridgeResult<T> {
    fs::create_dir_all(root).map_err(internal)?;
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(root.join(".desktop-storage.lock"))
        .map_err(internal)?;
    lock.lock_exclusive().map_err(internal)?;
    let result = operation();
    let _ = lock.unlock();
    result
}

fn read_json(path: &Path, default: Value) -> BridgeResult<Value> {
    if !path.exists() {
        return Ok(default);
    }
    serde_json::from_slice(&fs::read(path).map_err(internal)?).map_err(invalid)
}

fn validate_store(name: &str, value: &Value) -> Result<(), String> {
    match name {
        "entries" => crate::notebook_store::parse_entries_value(value.clone()).map(|_| ()),
        "settings" => value
            .is_object()
            .then_some(())
            .ok_or_else(|| "설정 저장 형식이 올바르지 않습니다. 객체여야 합니다.".into()),
        "exam-sessions" => exam_submission::validate_sessions_value(value),
        "generated-exams" => validate_persistent_store_value("generated-exams.json", value),
        "library-folders" => validate_persistent_store_value("library-folders.json", value),
        "gpt-solution-drafts" => validate_persistent_store_value("gpt-solution-drafts.json", value),
        "review-sessions" => validate_persistent_store_value("review-sessions.json", value),
        "pending-deletions" => validate_persistent_store_value("pending-deletions.json", value),
        "import-workspace-draft" => value
            .is_null()
            .then_some(())
            .or_else(|| value.is_object().then_some(()))
            .ok_or_else(|| "가져오기 작업실 초안은 객체여야 합니다.".into()),
        _ => Err("알 수 없는 저장소입니다.".into()),
    }
}

async fn auth(State(state): State<BridgeState>, request: Request, next: Next) -> Response {
    let origin = request
        .headers()
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok());
    let authorization = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());
    let origin_ok = origin == Some(EXACT_ORIGIN);
    if !origin_ok {
        return (StatusCode::FORBIDDEN, "허용되지 않은 Origin입니다.").into_response();
    }
    if request.method() == Method::OPTIONS {
        return cors_response(StatusCode::NO_CONTENT.into_response());
    }
    let authorized = bridge_request_authorized(origin, authorization, &state.token);
    if !authorized {
        return cors_response(
            (StatusCode::UNAUTHORIZED, "저장소 인증에 실패했습니다.").into_response(),
        );
    }
    cors_response(next.run(request).await)
}

fn bridge_request_authorized(
    origin: Option<&str>,
    authorization: Option<&str>,
    token: &str,
) -> bool {
    origin == Some(EXACT_ORIGIN)
        && authorization.and_then(|value| value.strip_prefix("Bearer ")) == Some(token)
}

fn cors_response(mut response: Response) -> Response {
    response.headers_mut().insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static(EXACT_ORIGIN),
    );
    response.headers_mut().insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET, PUT, POST, DELETE, OPTIONS"),
    );
    response.headers_mut().insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("authorization, content-type"),
    );
    response
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true, "backend": "desktop-proxy" }))
}

async fn load_store(
    State(state): State<BridgeState>,
    AxumPath(name): AxumPath<String>,
) -> BridgeResult<Json<Value>> {
    if !STORE_NAMES.contains(&name.as_str()) {
        return Err((StatusCode::NOT_FOUND, "알 수 없는 저장소입니다.".into()));
    }
    with_file_lock(&state.data_dir, || {
        if name == "entries" {
            let entries = state.store.load_entries().map_err(internal)?;
            return serde_json::to_value(entries).map(Json).map_err(internal);
        }
        let default = if name == "settings" || name == "import-workspace-draft" {
            Value::Null
        } else {
            Value::Array(Vec::new())
        };
        let value = read_json(&store_path(&state.data_dir, &name)?, default)?;
        if !value.is_null() {
            validate_store(&name, &value).map_err(invalid)?;
        }
        Ok(Json(value))
    })
}

async fn save_store(
    State(state): State<BridgeState>,
    AxumPath(name): AxumPath<String>,
    Json(value): Json<Value>,
) -> BridgeResult<Json<Value>> {
    if !STORE_NAMES.contains(&name.as_str()) {
        return Err((StatusCode::NOT_FOUND, "알 수 없는 저장소입니다.".into()));
    }
    validate_store(&name, &value).map_err(invalid)?;
    if name == "entries" {
        let entries = crate::notebook_store::parse_entries_value(value).map_err(invalid)?;
        state.store.save_entries(&entries).map_err(internal)?;
        return Ok(Json(json!({ "ok": true })));
    }
    with_file_lock(&state.data_dir, || {
        write_json_atomic(&store_path(&state.data_dir, &name)?, &value).map_err(internal)?;
        Ok(Json(json!({ "ok": true })))
    })
}

async fn load_entries_snapshot(State(state): State<BridgeState>) -> BridgeResult<Json<Value>> {
    with_file_lock(&state.data_dir, || {
        let entries = state.store.load_entries().map_err(internal)?;
        let revision = state.store.entries_revision().map_err(internal)?;
        Ok(Json(json!({ "entries": entries, "revision": revision })))
    })
}

async fn save_entries_if_revision(
    State(state): State<BridgeState>,
    Json(payload): Json<EntriesRevisionPayload>,
) -> BridgeResult<Json<Value>> {
    let entries = crate::notebook_store::parse_entries_value(payload.entries).map_err(invalid)?;
    let revision = state.store
        .save_entries_if_revision(&entries, &payload.expected_revision)
        .map_err(internal)?;
    Ok(Json(json!({ "revision": revision })))
}

async fn clear_store(
    State(state): State<BridgeState>,
    AxumPath(name): AxumPath<String>,
) -> BridgeResult<Json<Value>> {
    if name != "import-workspace-draft" {
        return Err((
            StatusCode::METHOD_NOT_ALLOWED,
            "삭제할 수 없는 저장소입니다.".into(),
        ));
    }
    with_file_lock(&state.data_dir, || {
        let path = store_path(&state.data_dir, &name)?;
        if path.exists() {
            fs::remove_file(path).map_err(internal)?;
        }
        Ok(Json(json!({ "ok": true })))
    })
}

async fn submit_exam(
    State(state): State<BridgeState>,
    Json(input): Json<ExamSubmissionTransactionInput>,
) -> BridgeResult<Json<Value>> {
    let result = exam_submission::submit_exam_transaction(
        &state.store,
        &state.data_dir.join("exam-sessions.json"),
        &state
            .data_dir
            .join(exam_submission::EXAM_SUBMISSION_JOURNAL_FILE),
        input,
    )
    .map_err(internal)?;
    serde_json::to_value(result).map(Json).map_err(internal)
}

fn safe_image_name(value: &str) -> bool {
    let path = Path::new(value);
    path.components().count() == 1
        && matches!(path.components().next(), Some(Component::Normal(_)))
        && value.rsplit_once('.').is_some_and(|(_, ext)| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "png" | "jpg" | "jpeg" | "webp"
            )
        })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImageUpload {
    filename: String,
    bytes_base64: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StagedImageUpload {
    source_name: String,
    bytes_base64: String,
    mime: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportManifestAsset {
    source_name: String,
    staged_filename: Option<String>,
    size: u64,
    sha256: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportManifest {
    id: String,
    mode: String,
    assets: Vec<ImportManifestAsset>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommitEntryPayload {
    entry_id: String,
    expected_updated_at: String,
    entry: crate::WrongAnswerEntry,
}

fn import_session_root(state: &BridgeState, session_id: &str) -> BridgeResult<PathBuf> {
    uuid::Uuid::parse_str(session_id)
        .map_err(|_| invalid("가져오기 자산 session ID가 올바르지 않습니다."))?;
    Ok(state.data_dir.join("import-workspaces").join(session_id))
}

fn promote_import_assets(state: &BridgeState, session_id: &str) -> BridgeResult<Vec<String>> {
    let root = import_session_root(state, session_id)?;
    let assets_dir = root.join("assets");
    if !assets_dir.is_dir() {
        return Err(invalid("가져오기 자산 session을 찾을 수 없습니다."));
    }
    let destination = state.data_dir.join("images");
    fs::create_dir_all(&destination).map_err(internal)?;
    with_file_lock(&state.data_dir, || {
        let mut moved: Vec<(PathBuf, PathBuf)> = Vec::new();
        let result = (|| -> BridgeResult<Vec<String>> {
            let mut filenames = Vec::new();
            for item in fs::read_dir(&assets_dir).map_err(internal)? {
                let source = item.map_err(internal)?.path();
                if !source.is_file() {
                    continue;
                }
                let filename = source
                    .file_name()
                    .and_then(|name| name.to_str())
                    .filter(|name| safe_image_name(name))
                    .ok_or_else(|| invalid("staged 이미지 파일명이 올바르지 않습니다."))?
                    .to_owned();
                let target = destination.join(&filename);
                if target.exists() {
                    return Err(invalid(format!(
                        "이미지 파일명이 이미 사용 중입니다: {filename}"
                    )));
                }
                fs::rename(&source, &target).map_err(internal)?;
                moved.push((source, target));
                filenames.push(filename);
            }
            Ok(filenames)
        })();
        match result {
            Ok(filenames) => {
                let _ = fs::remove_dir_all(&root);
                Ok(filenames)
            }
            Err(error) => {
                for (source, target) in moved.iter().rev() {
                    let _ = fs::rename(target, source);
                }
                Err(error)
            }
        }
    })
}

async fn create_import_session(State(state): State<BridgeState>) -> BridgeResult<Json<Value>> {
    let session_id = uuid::Uuid::new_v4().to_string();
    fs::create_dir_all(import_session_root(&state, &session_id)?.join("assets"))
        .map_err(internal)?;
    Ok(Json(json!({ "sessionId": session_id })))
}

async fn stage_import_asset(
    State(state): State<BridgeState>,
    AxumPath(session_id): AxumPath<String>,
    Json(upload): Json<StagedImageUpload>,
) -> BridgeResult<Json<Value>> {
    let bytes = STANDARD.decode(upload.bytes_base64).map_err(invalid)?;
    let staged_filename = crate::save_import_image_bytes_to_dir(
        &import_session_root(&state, &session_id)?.join("assets"),
        &bytes,
        Some(&upload.source_name),
        upload.mime.as_deref(),
    )
    .map_err(invalid)?;
    Ok(Json(json!({
        "stagedFilename": staged_filename,
        "sha256": format!("{:x}", Sha256::digest(&bytes)),
    })))
}

async fn validate_import_session(
    State(state): State<BridgeState>,
    Json(manifest): Json<ImportManifest>,
) -> BridgeResult<Json<Value>> {
    if manifest.mode != "tauri-staged" {
        return Ok(Json(
            json!({ "valid": true, "missingFiles": [], "mismatchedFiles": [] }),
        ));
    }
    let assets_dir = import_session_root(&state, &manifest.id)?.join("assets");
    let mut missing = Vec::new();
    let mut mismatched = Vec::new();
    for asset in manifest.assets {
        let Some(filename) = asset.staged_filename else {
            mismatched.push(asset.source_name);
            continue;
        };
        if !safe_image_name(&filename) {
            mismatched.push(asset.source_name);
            continue;
        }
        let path = assets_dir.join(filename);
        if !path.is_file() {
            missing.push(asset.source_name);
            continue;
        }
        let bytes = fs::read(path).map_err(internal)?;
        if bytes.len() as u64 != asset.size
            || asset.sha256.as_deref().map(str::to_ascii_lowercase)
                != Some(format!("{:x}", Sha256::digest(&bytes)))
        {
            mismatched.push(asset.source_name);
        }
    }
    Ok(Json(json!({
        "valid": missing.is_empty() && mismatched.is_empty(),
        "missingFiles": missing,
        "mismatchedFiles": mismatched,
    })))
}

async fn commit_import_entries(
    State(state): State<BridgeState>,
    AxumPath(session_id): AxumPath<String>,
    Json(entries): Json<Vec<crate::WrongAnswerEntry>>,
) -> BridgeResult<Json<Value>> {
    let root = import_session_root(&state, &session_id)?;
    let filenames = state
        .store
        .commit_staged_entries_add(&root.join("assets"), entries)
        .map_err(internal)?;
    let _ = fs::remove_dir_all(root);
    Ok(Json(json!({ "filenames": filenames })))
}

async fn commit_import_assets_only(
    State(state): State<BridgeState>,
    AxumPath(session_id): AxumPath<String>,
) -> BridgeResult<Json<Value>> {
    let filenames = promote_import_assets(&state, &session_id)?;
    Ok(Json(json!({ "filenames": filenames })))
}

async fn commit_import_entry(
    State(state): State<BridgeState>,
    AxumPath(session_id): AxumPath<String>,
    Json(payload): Json<CommitEntryPayload>,
) -> BridgeResult<Json<Value>> {
    let root = import_session_root(&state, &session_id)?;
    let filenames = state
        .store
        .commit_staged_entry_update(
            &root.join("assets"),
            &payload.entry_id,
            &payload.expected_updated_at,
            payload.entry,
        )
        .map_err(internal)?;
    let _ = fs::remove_dir_all(root);
    Ok(Json(json!({ "filenames": filenames })))
}

async fn discard_import_session(
    State(state): State<BridgeState>,
    AxumPath(session_id): AxumPath<String>,
) -> BridgeResult<Json<Value>> {
    let root = import_session_root(&state, &session_id)?;
    if root.exists() {
        fs::remove_dir_all(root).map_err(internal)?;
    }
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CleanupImportSessionsPayload {
    #[serde(default)]
    protected_session_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EntriesRevisionPayload {
    entries: Value,
    expected_revision: String,
}

fn cleanup_stale_import_sessions(root: &Path, protected: &[String]) -> Result<usize, String> {
    if !root.exists() {
        return Ok(0);
    }
    let protected: std::collections::HashSet<&str> = protected.iter().map(String::as_str).collect();
    let now = SystemTime::now();
    let mut removed = 0;
    for item in fs::read_dir(root).map_err(|error| error.to_string())? {
        let path = item.map_err(|error| error.to_string())?.path();
        if !path.is_dir() { continue; }
        let Some(id) = path.file_name().and_then(|name| name.to_str()) else { continue; };
        if protected.contains(id) { continue; }
        let modified = fs::metadata(&path).and_then(|metadata| metadata.modified()).unwrap_or(now);
        if now.duration_since(modified).unwrap_or_default() >= IMPORT_ASSET_SESSION_MAX_AGE {
            fs::remove_dir_all(path).map_err(|error| error.to_string())?;
            removed += 1;
        }
    }
    Ok(removed)
}

async fn cleanup_stale_import_sessions_route(
    State(state): State<BridgeState>,
    Json(payload): Json<CleanupImportSessionsPayload>,
) -> BridgeResult<Json<Value>> {
    let removed = cleanup_stale_import_sessions(
        &state.data_dir.join("import-workspaces"),
        &payload.protected_session_ids,
    ).map_err(internal)?;
    Ok(Json(json!({ "removed": removed })))
}

async fn save_image(
    State(state): State<BridgeState>,
    Json(upload): Json<ImageUpload>,
) -> BridgeResult<Json<Value>> {
    if !safe_image_name(&upload.filename) {
        return Err(invalid("허용되지 않은 이미지 파일명입니다."));
    }
    let bytes = STANDARD.decode(upload.bytes_base64).map_err(invalid)?;
    crate::images::validate_image_header_bytes(
        &bytes,
        Path::new(&upload.filename)
            .extension()
            .and_then(|v| v.to_str())
            .unwrap_or_default(),
    )
    .map_err(invalid)?;
    let images = state.data_dir.join("images");
    fs::create_dir_all(&images).map_err(internal)?;
    let generated = format!("{}_{}", uuid::Uuid::new_v4(), upload.filename);
    with_file_lock(&state.data_dir, || {
        write_bytes_atomic(&images.join(&generated), &bytes).map_err(internal)?;
        Ok(Json(json!({ "filename": generated })))
    })
}

async fn load_image(
    State(state): State<BridgeState>,
    AxumPath(filename): AxumPath<String>,
) -> BridgeResult<Response> {
    if !safe_image_name(&filename) {
        return Err(invalid("허용되지 않은 이미지 파일명입니다."));
    }
    let bytes = fs::read(state.data_dir.join("images").join(&filename))
        .map_err(|_| (StatusCode::NOT_FOUND, "이미지를 찾을 수 없습니다.".into()))?;
    let mime = if filename.to_ascii_lowercase().ends_with(".png") {
        "image/png"
    } else if filename.to_ascii_lowercase().ends_with(".webp") {
        "image/webp"
    } else {
        "image/jpeg"
    };
    Response::builder()
        .header(header::CONTENT_TYPE, mime)
        .body(Body::from(bytes))
        .map_err(internal)
}

async fn delete_image(
    State(state): State<BridgeState>,
    AxumPath(filename): AxumPath<String>,
) -> BridgeResult<Json<Value>> {
    if !safe_image_name(&filename) {
        return Err(invalid("허용되지 않은 이미지 파일명입니다."));
    }
    with_file_lock(&state.data_dir, || {
        let path = state.data_dir.join("images").join(filename);
        if path.exists() {
            fs::remove_file(path).map_err(internal)?;
        }
        Ok(Json(json!({ "ok": true })))
    })
}

fn parse_arg(name: &str) -> Option<String> {
    let mut args = env::args().skip(1);
    while let Some(argument) = args.next() {
        if argument == name {
            return args.next();
        }
    }
    None
}

pub fn run_dev_storage_bridge() -> Result<(), String> {
    let data_dir = parse_arg("--data-dir")
        .or_else(|| env::var("WRONG_ANSWER_STORAGE_DIR").ok())
        .map(PathBuf::from)
        .ok_or_else(|| "--data-dir가 필요합니다.".to_string())?;
    let token = parse_arg("--token")
        .or_else(|| env::var("WRONG_ANSWER_STORAGE_TOKEN").ok())
        .filter(|value| value.len() >= 43)
        .ok_or_else(|| "256-bit storage token이 필요합니다.".to_string())?;
    let port: u16 = parse_arg("--port")
        .or_else(|| env::var("WRONG_ANSWER_STORAGE_PORT").ok())
        .unwrap_or_else(|| "43131".into())
        .parse()
        .map_err(|_| "storage bridge port가 올바르지 않습니다.".to_string())?;
    fs::create_dir_all(data_dir.join("images")).map_err(|error| error.to_string())?;
    let _ = cleanup_stale_import_sessions(&data_dir.join("import-workspaces"), &[]);
    let state = BridgeState {
        store: Arc::new(NotebookStore::new(
            data_dir.join("entries.json"),
            data_dir.join("images"),
        )),
        data_dir,
        token,
    };
    let app = Router::new()
        .route("/v1/health", get(health))
        .route("/v1/entries/snapshot", get(load_entries_snapshot))
        .route("/v1/entries/conditional", post(save_entries_if_revision))
        .route(
            "/v1/stores/{store}",
            get(load_store).put(save_store).delete(clear_store),
        )
        .route("/v1/exam-submissions", post(submit_exam))
        .route("/v1/images", post(save_image))
        .route(
            "/v1/images/{filename}",
            get(load_image).delete(delete_image),
        )
        .route("/v1/import-sessions", post(create_import_session))
        .route(
            "/v1/import-sessions/validate",
            post(validate_import_session),
        )
        .route(
            "/v1/import-sessions/{session_id}/assets",
            post(stage_import_asset),
        )
        .route(
            "/v1/import-sessions/{session_id}/commit",
            post(commit_import_assets_only),
        )
        .route(
            "/v1/import-sessions/{session_id}/entries",
            post(commit_import_entries),
        )
        .route(
            "/v1/import-sessions/{session_id}/entry",
            post(commit_import_entry),
        )
        .route(
            "/v1/import-sessions/{session_id}",
            axum::routing::delete(discard_import_session),
        )
        .route("/v1/import-sessions/cleanup", post(cleanup_stale_import_sessions_route))
        .layer(middleware::from_fn_with_state(state.clone(), auth))
        .with_state(state);
    let runtime = tokio::runtime::Runtime::new().map_err(|error| error.to_string())?;
    runtime.block_on(async move {
        let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
        let listener = tokio::net::TcpListener::bind(address)
            .await
            .map_err(|error| error.to_string())?;
        println!("BRIDGE_READY http://127.0.0.1:{port}");
        axum::serve(listener, app)
            .await
            .map_err(|error| error.to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::{
        bridge_request_authorized, safe_image_name, store_path, validate_store, EXACT_ORIGIN,
    };
    use serde_json::json;

    #[test]
    fn store_names_are_allowlisted_and_cannot_traverse() {
        let root = std::path::Path::new("C:/fixture");
        assert!(store_path(root, "entries").is_ok());
        assert!(store_path(root, "../settings").is_err());
        assert!(store_path(root, "C:\\settings").is_err());
    }

    #[test]
    fn image_names_reject_paths_and_non_images() {
        assert!(safe_image_name("question.png"));
        assert!(!safe_image_name("../question.png"));
        assert!(!safe_image_name("folder/question.png"));
        assert!(!safe_image_name("question.json"));
    }

    #[test]
    fn nested_store_validation_is_shared_with_runtime_contracts() {
        assert!(validate_store("exam-sessions", &json!([{}])).is_err());
        assert!(validate_store("generated-exams", &json!([{}])).is_err());
        assert!(validate_store("library-folders", &json!([{}])).is_err());
        assert!(validate_store("gpt-solution-drafts", &json!([{}])).is_err());
        assert!(validate_store(
            "import-workspace-draft",
            &json!({ "id": "w", "groups": [] })
        )
        .is_ok());
    }

    #[test]
    fn bridge_requires_exact_origin_and_bearer_token() {
        assert!(bridge_request_authorized(
            Some(EXACT_ORIGIN),
            Some("Bearer secret"),
            "secret"
        ));
        assert!(!bridge_request_authorized(
            Some("http://localhost:1420"),
            Some("Bearer secret"),
            "secret"
        ));
        assert!(!bridge_request_authorized(
            Some(EXACT_ORIGIN),
            Some("Bearer wrong"),
            "secret"
        ));
        assert!(!bridge_request_authorized(
            None,
            Some("Bearer secret"),
            "secret"
        ));
    }
}
