mod ai;
mod backup;
mod images;
mod import_assets;
mod integrity;
mod mcp_bridge;
mod mcp_bridge_contract;
mod notebook_store;
mod storage;

pub(crate) use images::{
    image_path, images_dir, save_import_image_bytes_to_dir, validate_image_filename,
    validate_image_magic,
};
pub(crate) use storage::{
    app_dir, data_file, data_schema_file, load_settings_raw, settings_file, unix_time_string,
    write_bytes_atomic, write_json_atomic, CURRENT_DATA_SCHEMA_VERSION,
};

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::Arc;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplanationPart {
    pub id: String,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub images: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetFigureItem {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub question_number: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub caption: String,
    #[serde(default)]
    pub image: Option<String>,
    #[serde(default = "default_figure_source")]
    pub source: String,
    #[serde(default)]
    pub needs_review: Option<bool>,
    /// Preserve forward-compatible figure metadata written by the frontend.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

fn default_figure_source() -> String {
    "original".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WrongAnswerEntry {
    pub id: String,
    pub subject: String,
    #[serde(default)]
    pub title: String,
    pub question: String,
    #[serde(default)]
    pub question_images: Vec<String>,
    #[serde(default = "default_entry_kind")]
    pub entry_kind: String,
    #[serde(default)]
    pub difficult: bool,
    #[serde(default)]
    pub difficulty: String,
    pub my_answer: String,
    pub correct_answer: String,
    #[serde(default)]
    pub explanation: String,
    #[serde(default)]
    pub explanation_images: Vec<String>,
    #[serde(default)]
    pub explanation_parts: Vec<ExplanationPart>,
    #[serde(default)]
    pub memo: String,
    #[serde(default)]
    pub annotations: Vec<serde_json::Value>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub answer_key: Vec<serde_json::Value>,
    #[serde(default)]
    pub figures: Vec<SheetFigureItem>,
    #[serde(default)]
    pub import_audit: Option<serde_json::Value>,
    #[serde(default)]
    pub rejected_notes: Vec<String>,
    #[serde(default)]
    pub review: Option<serde_json::Value>,
    #[serde(default)]
    pub checklist: Vec<serde_json::Value>,
    #[serde(default)]
    pub images: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub mastered: bool,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

fn default_entry_kind() -> String {
    "wrong_answer".to_string()
}

/// MCP active-exam sharing consent parsed from active-exam-context.json.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ActiveExamContext {
    #[serde(default)]
    pub share_user_response: bool,
    #[serde(default)]
    pub share_scratch_note: bool,
    #[serde(default)]
    pub share_question_images: bool,
    #[serde(default)]
    pub share_source_page_images: bool,
    #[serde(default)]
    pub context_updated_at: Option<String>,
}

impl ActiveExamContext {
    pub fn from_value(value: &serde_json::Value) -> Self {
        serde_json::from_value(value.clone()).unwrap_or_default()
    }
}

#[tauri::command]
fn load_entries(
    store: tauri::State<'_, Arc<notebook_store::NotebookStore>>,
) -> Result<Vec<WrongAnswerEntry>, String> {
    store.load_entries()
}

#[tauri::command]
fn save_entries(
    store: tauri::State<'_, Arc<notebook_store::NotebookStore>>,
    entries: Vec<WrongAnswerEntry>,
) -> Result<(), String> {
    store.save_entries(&entries)
}

#[tauri::command]
fn load_exam_sessions(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    load_array_json_file(
        &app_dir(&app)?.join("exam-sessions.json"),
        "모의고사 세션 저장 형식이 올바르지 않습니다. 배열이어야 합니다.",
    )
}

#[tauri::command]
fn save_exam_sessions(app: tauri::AppHandle, sessions: serde_json::Value) -> Result<(), String> {
    save_array_json_file(
        &app_dir(&app)?.join("exam-sessions.json"),
        &sessions,
        "모의고사 세션 저장 형식이 올바르지 않습니다. 배열이어야 합니다.",
    )
}

fn ensure_data_schema_manifest(app: &tauri::AppHandle) -> Result<(), String> {
    let path = data_schema_file(app)?;
    if path.exists() {
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let value: serde_json::Value = serde_json::from_str(&raw)
            .map_err(|e| format!("데이터 스키마를 읽지 못했습니다: {e}"))?;
        if value
            .get("schemaVersion")
            .and_then(serde_json::Value::as_u64)
            != Some(CURRENT_DATA_SCHEMA_VERSION as u64)
        {
            return Err("지원하지 않는 데이터 스키마 버전입니다.".into());
        }
        return Ok(());
    }
    let entries_path = data_file(app)?;
    if entries_path.exists() {
        let raw = fs::read_to_string(entries_path).map_err(|e| e.to_string())?;
        let document: serde_json::Value = serde_json::from_str(&raw)
            .map_err(|e| format!("entries.json을 읽지 못했습니다: {e}"))?;
        notebook_store::parse_versioned_entries_value(document)?;
    }
    let settings_path = settings_file(app)?;
    if settings_path.exists() {
        let raw = fs::read_to_string(settings_path).map_err(|e| e.to_string())?;
        let _: serde_json::Value = serde_json::from_str(&raw)
            .map_err(|e| format!("settings.json을 읽지 못했습니다: {e}"))?;
    }
    let value = serde_json::json!({
        "schemaVersion": CURRENT_DATA_SCHEMA_VERSION,
        "appVersion": env!("CARGO_PKG_VERSION"),
        "updatedAt": unix_time_string(),
    });
    write_json_atomic(&path, &value)
}

#[tauri::command]
fn load_generated_exams(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    load_array_json_file(
        &app_dir(&app)?.join("generated-exams.json"),
        "생성 모의고사 저장 형식이 올바르지 않습니다. 배열이어야 합니다.",
    )
}

#[tauri::command]
fn save_generated_exams(app: tauri::AppHandle, exams: serde_json::Value) -> Result<(), String> {
    save_array_json_file(
        &app_dir(&app)?.join("generated-exams.json"),
        &exams,
        "생성 모의고사 저장 형식이 올바르지 않습니다. 배열이어야 합니다.",
    )
}

fn validate_array_json(
    value: serde_json::Value,
    error_message: &str,
) -> Result<serde_json::Value, String> {
    if value.is_array() {
        Ok(value)
    } else {
        Err(error_message.to_string())
    }
}

fn load_array_json_file(path: &Path, error_message: &str) -> Result<serde_json::Value, String> {
    if !path.exists() {
        return Ok(serde_json::json!([]));
    }
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let value = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    validate_array_json(value, error_message)
}

fn save_array_json_file(
    path: &Path,
    value: &serde_json::Value,
    error_message: &str,
) -> Result<(), String> {
    validate_array_json(value.clone(), error_message)?;
    write_json_atomic(path, value)
}

#[tauri::command]
fn load_gpt_solution_roundtrip_drafts(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = app_dir(&app)?.join("gpt-solution-drafts.json");
    if !path.exists() {
        return Ok(serde_json::json!([]));
    }
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let drafts: serde_json::Value =
        serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    if !drafts.is_array() {
        return Err("GPT 해설 초안 형식이 올바르지 않습니다. 배열이어야 합니다.".into());
    }
    Ok(drafts)
}

#[tauri::command]
fn save_gpt_solution_roundtrip_drafts(
    app: tauri::AppHandle,
    drafts: serde_json::Value,
) -> Result<(), String> {
    if !drafts.is_array() {
        return Err("GPT 해설 초안 형식이 올바르지 않습니다. 배열이어야 합니다.".into());
    }
    write_json_atomic(&app_dir(&app)?.join("gpt-solution-drafts.json"), &drafts)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LibraryFolder {
    id: String,
    name: String,
    #[serde(default)]
    parent_id: Option<String>,
    sort_order: i64,
    created_at: String,
    updated_at: String,
}

fn validate_library_folders(folders: &[LibraryFolder]) -> Result<(), String> {
    let mut ids = std::collections::HashSet::new();
    for folder in folders {
        if folder.id.trim().is_empty()
            || folder.name.trim().is_empty()
            || folder.created_at.trim().is_empty()
            || folder.updated_at.trim().is_empty()
        {
            return Err("폴더 데이터의 필수 값이 비어 있습니다.".into());
        }
        if !ids.insert(folder.id.trim()) {
            return Err("폴더 ID가 중복되었습니다.".into());
        }
        if folder.parent_id.as_deref().map(str::trim) == Some(folder.id.trim()) {
            return Err("폴더는 자기 자신을 부모로 가질 수 없습니다.".into());
        }
    }

    let by_id: std::collections::HashMap<&str, &LibraryFolder> = folders
        .iter()
        .map(|folder| (folder.id.trim(), folder))
        .collect();
    for folder in folders {
        let mut seen = std::collections::HashSet::new();
        let mut current = folder;
        while let Some(parent_id) = current.parent_id.as_deref().map(str::trim) {
            let parent = by_id
                .get(parent_id)
                .ok_or_else(|| "존재하지 않는 상위 폴더를 지정할 수 없습니다.".to_string())?;
            if !seen.insert(parent_id) {
                return Err("폴더를 자신의 하위 폴더로 이동할 수 없습니다.".into());
            }
            current = parent;
        }
    }
    Ok(())
}

#[tauri::command]
fn load_library_folders(app: tauri::AppHandle) -> Result<Vec<LibraryFolder>, String> {
    let path = app_dir(&app)?.join("library-folders.json");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let folders: Vec<LibraryFolder> =
        serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    validate_library_folders(&folders)?;
    Ok(folders)
}

#[tauri::command]
fn save_library_folders(app: tauri::AppHandle, folders: Vec<LibraryFolder>) -> Result<(), String> {
    validate_library_folders(&folders)?;
    let value = serde_json::to_value(folders).map_err(|error| error.to_string())?;
    write_json_atomic(&app_dir(&app)?.join("library-folders.json"), &value)
}

#[tauri::command]
fn get_mcp_bridge_status(
    bridge: tauri::State<'_, Arc<mcp_bridge::McpBridgeManager>>,
) -> mcp_bridge::McpBridgeStatus {
    bridge.status()
}

#[tauri::command]
async fn set_mcp_bridge_enabled(
    app: tauri::AppHandle,
    bridge: tauri::State<'_, Arc<mcp_bridge::McpBridgeManager>>,
    enabled: bool,
    port: Option<u16>,
) -> Result<mcp_bridge::McpBridgeStatus, String> {
    let requested_port = port.unwrap_or(mcp_bridge::DEFAULT_MCP_PORT);
    if requested_port < 1024 {
        return Err("MCP 포트는 1024 이상이어야 합니다.".into());
    }
    let status = bridge.set_enabled(enabled, requested_port).await?;
    let mut settings: serde_json::Value =
        serde_json::from_str(&load_settings_raw(&app)?).unwrap_or_else(|_| serde_json::json!({}));
    let root = settings
        .as_object_mut()
        .ok_or_else(|| "설정 형식이 올바르지 않습니다.".to_string())?;
    root.insert(
        "mcpBridge".into(),
        serde_json::json!({ "enabled": enabled, "port": requested_port }),
    );
    write_json_atomic(&settings_file(&app)?, &settings)?;
    Ok(status)
}

#[tauri::command]
async fn test_mcp_bridge(
    bridge: tauri::State<'_, Arc<mcp_bridge::McpBridgeManager>>,
) -> Result<mcp_bridge::McpBridgeStatus, String> {
    bridge.test().await
}

/// Returns only a short-lived one-time code; the bearer credential never
/// crosses the Tauri command boundary or appears in settings.json.
#[tauri::command]
fn create_mcp_bridge_pairing(
    bridge: tauri::State<'_, Arc<mcp_bridge::McpBridgeManager>>,
) -> Result<serde_json::Value, String> {
    let code = bridge.create_pairing_code()?;
    let expires_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_millis() + 300_000)
        .unwrap_or(0)
        .to_string();
    let status = bridge.status();
    Ok(serde_json::json!({
        "code": code,
        "expiresAt": expires_at,
        "pairingUrl": format!("http://127.0.0.1:{}/pair", status.port),
        "mcpUrl": format!("http://127.0.0.1:{}/mcp", status.port),
        "bridgeUrl": format!("http://127.0.0.1:{}/mcp", status.port),
    }))
}

#[tauri::command]
fn rotate_mcp_bridge_credential(
    bridge: tauri::State<'_, Arc<mcp_bridge::McpBridgeManager>>,
) -> Result<mcp_bridge::McpBridgeStatus, String> {
    bridge.rotate_token()?;
    Ok(bridge.status())
}

#[tauri::command]
fn disconnect_mcp_bridge_clients(
    bridge: tauri::State<'_, Arc<mcp_bridge::McpBridgeManager>>,
) -> Result<mcp_bridge::McpBridgeStatus, String> {
    bridge.disconnect()?;
    Ok(bridge.status())
}

#[tauri::command]
fn sync_active_context(
    bridge: tauri::State<'_, Arc<mcp_bridge::McpBridgeManager>>,
    entry_id: Option<String>,
    question_number: Option<String>,
) {
    bridge.sync_active_context(entry_id, question_number);
}

#[tauri::command]
fn sync_active_exam_context(
    bridge: tauri::State<'_, Arc<mcp_bridge::McpBridgeManager>>,
    context: serde_json::Value,
) -> Result<(), String> {
    bridge.sync_active_exam_context(context)
}

#[tauri::command]
fn sync_active_export_context(
    bridge: tauri::State<'_, Arc<mcp_bridge::McpBridgeManager>>,
    context: serde_json::Value,
) -> Result<(), String> {
    bridge.sync_active_export_context(context)
}

#[tauri::command]
fn load_settings(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    serde_json::from_str(&load_settings_raw(&app)?).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_settings(app: tauri::AppHandle, settings: serde_json::Value) -> Result<(), String> {
    write_json_atomic(&settings_file(&app)?, &settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::images::{
        extension_from_magic, resolve_import_image_extension, validate_image_header_bytes,
        validate_import_filename_hint, MAX_IMPORT_IMAGE_BYTES,
    };

    fn sample_entry() -> WrongAnswerEntry {
        WrongAnswerEntry {
            id: "1".into(),
            subject: "수학".into(),
            title: "테스트".into(),
            question: "문제".into(),
            question_images: vec![],
            entry_kind: "wrong_answer".into(),
            difficult: false,
            difficulty: "none".into(),
            my_answer: "".into(),
            correct_answer: "".into(),
            explanation: "".into(),
            explanation_images: vec![],
            explanation_parts: vec![],
            memo: "".into(),
            annotations: vec![],
            tags: vec![],
            answer_key: vec![],
            figures: vec![],
            import_audit: None,
            rejected_notes: vec![],
            review: None,
            checklist: vec![],
            images: vec![],
            created_at: "2026-01-01T00:00:00.000Z".into(),
            updated_at: "2026-01-01T00:00:00.000Z".into(),
            mastered: false,
            extra: serde_json::Map::new(),
        }
    }

    #[test]
    fn import_image_byte_limit_is_25mb() {
        assert_eq!(MAX_IMPORT_IMAGE_BYTES, 25 * 1024 * 1024);
    }

    #[test]
    fn ai_image_limits_remain_unchanged() {
        assert_eq!(ai::MAX_AI_IMAGE_BYTES, 10 * 1024 * 1024);
        assert_eq!(ai::MAX_AI_IMAGE_COUNT, 20);
        assert_eq!(ai::MAX_AI_IMAGE_TOTAL_BYTES, 14 * 1024 * 1024);
    }

    #[test]
    fn similar_question_request_rejects_unknown_or_sensitive_fields() {
        let valid = serde_json::json!({
            "context": { "sourceId": "source", "concepts": [], "tags": [], "keywords": [] },
            "candidates": [{ "candidateId": "entry:1", "questionText": "문제", "subject": "수학", "hasExplanation": false }]
        });
        assert!(serde_json::from_value::<ai::SimilarQuestionRankingRequest>(valid).is_ok());

        let invalid = serde_json::json!({
            "context": { "sourceId": "source", "concepts": [], "tags": [], "keywords": [], "memo": "사용자 메모" },
            "candidates": [{ "candidateId": "entry:1", "questionText": "문제", "subject": "수학", "hasExplanation": false }]
        });
        assert!(serde_json::from_value::<ai::SimilarQuestionRankingRequest>(invalid).is_err());
    }

    #[test]
    fn rejects_non_array_exam_session_and_generated_exam_shapes() {
        let session_error = "모의고사 세션 저장 형식이 올바르지 않습니다. 배열이어야 합니다.";
        let generated_error = "생성 모의고사 저장 형식이 올바르지 않습니다. 배열이어야 합니다.";
        assert_eq!(
            validate_array_json(serde_json::json!([]), session_error).unwrap(),
            serde_json::json!([])
        );
        assert_eq!(
            validate_array_json(serde_json::json!([]), generated_error).unwrap(),
            serde_json::json!([])
        );
        assert_eq!(
            validate_array_json(serde_json::json!({}), session_error).unwrap_err(),
            session_error
        );
        assert_eq!(
            validate_array_json(serde_json::json!({}), generated_error).unwrap_err(),
            generated_error
        );
    }

    #[test]
    fn rejects_non_array_save_payload_without_changing_existing_file() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("exam-sessions.json");
        fs::write(&path, br#"[{"id":"existing"}]"#).expect("write existing payload");

        let error = save_array_json_file(
            &path,
            &serde_json::json!({}),
            "모의고사 세션 저장 형식이 올바르지 않습니다. 배열이어야 합니다.",
        )
        .expect_err("object payload must be rejected");

        assert!(error.contains("배열이어야 합니다"));
        assert_eq!(
            fs::read(&path).expect("read existing payload"),
            br#"[{"id":"existing"}]"#
        );
    }

    #[test]
    fn rejects_non_array_load_payload_and_accepts_empty_array() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("generated-exams.json");
        fs::write(&path, b"{}").expect("write malformed shape");
        let error = load_array_json_file(
            &path,
            "생성 모의고사 저장 형식이 올바르지 않습니다. 배열이어야 합니다.",
        )
        .expect_err("object payload must be rejected");
        assert!(error.contains("배열이어야 합니다"));

        fs::write(&path, b"[]").expect("write empty array");
        assert_eq!(
            load_array_json_file(&path, "shape error").unwrap(),
            serde_json::json!([])
        );
    }

    #[test]
    fn validates_image_filenames() {
        assert!(validate_image_filename("abc.png").is_ok());
        assert!(validate_image_filename("abc.JPG").is_ok());
        assert!(validate_image_filename("../abc.png").is_err());
        assert!(validate_image_filename("nested/abc.png").is_err());
        assert!(validate_image_filename("nested\\abc.png").is_err());
        assert!(validate_image_filename("abc.txt").is_err());
        assert!(validate_image_filename("").is_err());
    }

    #[test]
    fn validates_image_headers() {
        assert!(validate_image_header_bytes(
            &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a],
            "png"
        )
        .is_ok());
        assert!(validate_image_header_bytes(&[0xff, 0xd8, 0xff], "jpg").is_ok());
        assert!(validate_image_header_bytes(b"not an image", "png").is_err());
    }

    #[test]
    fn detects_image_extension_from_magic_bytes() {
        let png = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
        assert_eq!(extension_from_magic(&png), Some("png"));
        assert_eq!(extension_from_magic(&[0xff, 0xd8, 0xff]), Some("jpeg"));
        assert_eq!(extension_from_magic(b"GIF89a"), Some("gif"));
        assert!(extension_from_magic(b"not-an-image").is_none());
    }

    #[test]
    fn resolves_import_image_extension_from_filename_mime_or_magic() {
        let png = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
        assert_eq!(
            resolve_import_image_extension(Some("scan.png"), None, &png).unwrap(),
            "png"
        );
        assert_eq!(
            resolve_import_image_extension(None, Some("image/png"), &png).unwrap(),
            "png"
        );
        assert_eq!(
            resolve_import_image_extension(None, None, &png).unwrap(),
            "png"
        );
        assert!(resolve_import_image_extension(Some("scan.txt"), None, &png).is_err());
        assert!(resolve_import_image_extension(Some("scan.jpg"), None, &png).is_err());
        assert!(
            resolve_import_image_extension(None, Some("image/png"), &[0xff, 0xd8, 0xff]).is_err()
        );
    }

    #[test]
    fn rejects_unsafe_import_filename_hints() {
        assert!(validate_import_filename_hint("../scan.png").is_err());
        assert!(validate_import_filename_hint("nested/scan.png").is_err());
        assert!(validate_import_filename_hint("scan.png").is_ok());
    }

    #[test]
    fn saves_import_image_bytes_atomically() {
        let dir = tempfile::tempdir().expect("tempdir");
        let png = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0x00];

        let filename =
            save_import_image_bytes_to_dir(dir.path(), &png, Some("import.png"), Some("image/png"))
                .expect("save import image");

        assert!(filename.ends_with(".png"));
        let saved = fs::read(dir.path().join(&filename)).expect("read saved image");
        assert_eq!(saved, png);
    }

    #[test]
    fn rejects_oversized_import_image_bytes() {
        let dir = tempfile::tempdir().expect("tempdir");
        let oversized = vec![0u8; (MAX_IMPORT_IMAGE_BYTES + 1) as usize];

        let oversize_err =
            save_import_image_bytes_to_dir(dir.path(), &oversized, Some("big.png"), None)
                .expect_err("oversized image");
        assert!(oversize_err.contains("25MB"));

        let empty_err = save_import_image_bytes_to_dir(dir.path(), &[], Some("empty.png"), None)
            .expect_err("empty image");
        assert!(empty_err.contains("비어"));
    }

    #[test]
    fn maps_vision_mime_types_and_rejects_gif() {
        assert_eq!(ai::vision_image_mime("page.png").unwrap(), "image/png");
        assert_eq!(ai::vision_image_mime("page.JPG").unwrap(), "image/jpeg");
        assert_eq!(ai::vision_image_mime("page.webp").unwrap(), "image/webp");
        assert!(ai::vision_image_mime("page.gif").is_err());
    }

    #[test]
    fn builds_gemini_inline_data_part() {
        let part = ai::gemini_inline_data_part("image/png", b"png");
        assert_eq!(part["inline_data"]["mime_type"], "image/png");
        assert_eq!(part["inline_data"]["data"], "cG5n");
    }

    #[test]
    fn collects_figure_images() {
        let mut entry = sample_entry();
        entry.extra.insert(
            "sourcePageImages".into(),
            serde_json::json!(["source-page.png"]),
        );
        entry.extra.insert(
            "learningBlocks".into(),
            serde_json::json!([{ "images": ["block.png"] }]),
        );
        entry.extra.insert(
            "supplementalResources".into(),
            serde_json::json!([{ "images": ["supplemental.png"] }]),
        );
        entry.figures = vec![SheetFigureItem {
            id: "figure-1".into(),
            question_number: "1".into(),
            title: "그림".into(),
            caption: "검사용 그림".into(),
            image: Some("figure.png".into()),
            source: "original".into(),
            needs_review: None,
            extra: serde_json::Map::new(),
        }];
        entry.figures[0].extra.insert(
            "original".into(),
            serde_json::json!({ "sourcePageImage": "figure-source.png" }),
        );

        let filenames = notebook_store::collect_entry_image_filenames(&entry);
        assert!(filenames.contains("figure.png"));
        assert!(filenames.contains("source-page.png"));
        assert!(filenames.contains("block.png"));
        assert!(filenames.contains("supplemental.png"));
        assert!(filenames.contains("figure-source.png"));
    }

    #[test]
    fn active_exam_context_defaults_share_flags_to_false() {
        let ctx = ActiveExamContext::from_value(&serde_json::json!({}));
        assert!(!ctx.share_user_response);
        assert!(!ctx.share_scratch_note);
        assert!(!ctx.share_question_images);
        assert!(!ctx.share_source_page_images);
        assert!(ctx.context_updated_at.is_none());
    }

    #[test]
    fn active_exam_context_deserializes_share_fields_tolerantly() {
        let value = serde_json::json!({
            "sessionId": "s1",
            "shareUserResponse": true,
            "shareQuestionImages": true,
            "unknownField": 123,
            "contextUpdatedAt": "2026-01-01T00:00:00Z"
        });
        let ctx = ActiveExamContext::from_value(&value);
        assert!(ctx.share_user_response);
        assert!(!ctx.share_scratch_note);
        assert!(ctx.share_question_images);
        assert!(!ctx.share_source_page_images);
        assert_eq!(
            ctx.context_updated_at.as_deref(),
            Some("2026-01-01T00:00:00Z")
        );
    }

    #[test]
    fn writes_entries_atomically() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("entries.json");
        let entries = vec![sample_entry()];
        let store = notebook_store::NotebookStore::new(path.clone(), dir.path().join("images"));

        store.save_entries(&entries).expect("write entries");

        let saved = fs::read_to_string(path).expect("read entries");
        assert!(saved.contains("\"subject\": \"수학\""));
        assert!(saved.contains("\"entryKind\": \"wrong_answer\""));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle().plugin(tauri_plugin_process::init())?;
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            let handle = app.handle().clone();
            if let Err(error) = ensure_data_schema_manifest(&handle) {
                eprintln!("data schema validation deferred: {error}");
            }
            let store = Arc::new(notebook_store::NotebookStore::new(
                data_file(&handle).map_err(std::io::Error::other)?,
                images_dir(&handle).map_err(std::io::Error::other)?,
            ));
            let bridge = Arc::new(mcp_bridge::McpBridgeManager::new(
                Arc::clone(&store),
                app_dir(&handle).map_err(std::io::Error::other)?,
            ));
            // A saved enabled flag is honored only in the desktop process. The
            // bridge still binds exclusively to 127.0.0.1 and requires keyring auth.
            let should_start = load_settings_raw(&handle)
                .ok()
                .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
                .and_then(|settings| {
                    settings
                        .get("mcpBridge")
                        .and_then(|value| value.get("enabled"))
                        .and_then(|value| value.as_bool())
                })
                .unwrap_or(false);
            if should_start {
                let bridge_to_start = Arc::clone(&bridge);
                let saved_port = load_settings_raw(&handle)
                    .ok()
                    .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
                    .and_then(|settings| {
                        settings
                            .get("mcpBridge")
                            .and_then(|value| value.get("port"))
                            .and_then(|value| value.as_u64())
                    })
                    .and_then(|value| u16::try_from(value).ok())
                    .unwrap_or(mcp_bridge::DEFAULT_MCP_PORT);
                tauri::async_runtime::spawn(async move {
                    let _ = bridge_to_start.set_enabled(true, saved_port).await;
                });
            }
            app.manage(store);
            app.manage(bridge);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_entries,
            save_entries,
            load_exam_sessions,
            save_exam_sessions,
            load_generated_exams,
            save_generated_exams,
            load_gpt_solution_roundtrip_drafts,
            save_gpt_solution_roundtrip_drafts,
            load_library_folders,
            save_library_folders,
            load_settings,
            save_settings,
            ai::get_ai_provider_status,
            ai::save_ai_provider_config,
            ai::save_ai_provider_key,
            ai::clear_ai_provider_key,
            ai::generate_import_with_ai,
            ai::rank_similar_questions_with_ai,
            images::save_import_image_bytes,
            import_assets::create_import_asset_session,
            import_assets::stage_import_asset_bytes,
            import_assets::commit_import_asset_session,
            import_assets::commit_import_asset_session_entry,
            import_assets::commit_import_asset_session_entries,
            import_assets::discard_import_asset_session,
            import_assets::validate_import_asset_session,
            import_assets::cleanup_stale_import_asset_sessions,
            images::save_image,
            images::get_image_file_path,
            images::delete_image,
            backup::create_backup_zip,
            backup::create_auto_backup,
            backup::create_pre_update_backup,
            backup::restore_backup_zip,
            integrity::run_integrity_check,
            integrity::cleanup_orphan_images,
            integrity::preview_orphan_images,
            get_mcp_bridge_status,
            set_mcp_bridge_enabled,
            test_mcp_bridge,
            create_mcp_bridge_pairing,
            rotate_mcp_bridge_credential,
            disconnect_mcp_bridge_clients,
            sync_active_context,
            sync_active_exam_context,
            sync_active_export_context,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
