mod mcp_bridge;
mod notebook_store;

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tauri::Manager;
use uuid::Uuid;
use zip::write::FileOptions;

const MAX_IMPORT_IMAGE_BYTES: u64 = 25 * 1024 * 1024;
const MAX_AI_IMAGE_BYTES: u64 = 10 * 1024 * 1024;
const MAX_AI_IMAGE_COUNT: usize = 20;
const MAX_AI_IMAGE_TOTAL_BYTES: u64 = 14 * 1024 * 1024;
const MAX_BACKUP_ZIP_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_BACKUP_JSON_BYTES: u64 = 100 * 1024 * 1024;
const MAX_BACKUP_TOTAL_IMAGE_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_BACKUP_ENTRY_COUNT: usize = 10_000;
const AI_KEYRING_SERVICE: &str = "wrong-answer-notebook";
const AI_KEYRING_USER: &str = "gemini-api-key";
const ENTRIES_SCHEMA_VERSION: u32 = 2;
const CURRENT_DATA_SCHEMA_VERSION: u32 = 1;
const PERSISTENT_DATA_FILES: &[&str] = &[
    "entries.json",
    "settings.json",
    "exam-sessions.json",
    "generated-exams.json",
    "data-schema.json",
];

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredEntriesDocument {
    schema_version: u32,
    entries: Vec<WrongAnswerEntry>,
}

fn default_entry_kind() -> String {
    "wrong_answer".to_string()
}

fn app_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn data_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join("entries.json"))
}

fn settings_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join("settings.json"))
}

fn ai_provider_key_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join("ai_provider_key.txt"))
}

fn ai_provider_key_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(AI_KEYRING_SERVICE, AI_KEYRING_USER)
        .map_err(|e| format!("OS 보안 저장소를 열지 못했습니다: {e}"))
}

fn images_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_dir(app)?.join("images");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
enum AiProviderType {
    #[serde(rename = "manual")]
    Manual,
    #[serde(rename = "gemini-flash-lite")]
    GeminiFlashLite,
    #[serde(rename = "gemini-3.5-flash")]
    Gemini35Flash,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
enum AiProviderKeySource {
    #[serde(rename = "env")]
    Env,
    #[serde(rename = "tauri-settings")]
    TauriSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiProviderConfig {
    #[serde(rename = "type")]
    provider_type: AiProviderType,
    enabled: bool,
    key_source: AiProviderKeySource,
    #[serde(default)]
    has_stored_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiProviderStatus {
    #[serde(rename = "type")]
    provider_type: AiProviderType,
    enabled: bool,
    key_source: AiProviderKeySource,
    has_stored_key: bool,
    has_env_key: bool,
    available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

fn default_ai_provider_config() -> AiProviderConfig {
    AiProviderConfig {
        provider_type: AiProviderType::Manual,
        enabled: false,
        key_source: AiProviderKeySource::Env,
        has_stored_key: false,
    }
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrityIssue {
    pub id: String,
    pub severity: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entry_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrityReport {
    pub checked_at: String,
    pub issues: Vec<IntegrityIssue>,
}

fn is_allowed_image_extension(ext: &str) -> bool {
    matches!(
        ext.to_ascii_lowercase().as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp"
    )
}

fn validate_image_filename(filename: &str) -> Result<(), String> {
    if filename.trim().is_empty() || filename != filename.trim() {
        return Err("이미지 파일명이 올바르지 않습니다.".into());
    }
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err("이미지 파일명에 경로를 포함할 수 없습니다.".into());
    }
    let path = Path::new(filename);
    if path.is_absolute() {
        return Err("이미지 파일명에 절대 경로를 사용할 수 없습니다.".into());
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .ok_or_else(|| "이미지 확장자를 확인할 수 없습니다.".to_string())?;
    if !is_allowed_image_extension(ext) {
        return Err("지원하지 않는 이미지 형식입니다.".into());
    }
    Ok(())
}

fn image_path(app: &tauri::AppHandle, filename: &str) -> Result<PathBuf, String> {
    validate_image_filename(filename)?;
    Ok(images_dir(app)?.join(filename))
}

fn validate_image_header_bytes(bytes: &[u8], ext: &str) -> Result<(), String> {
    let valid = match ext.to_ascii_lowercase().as_str() {
        "png" => bytes.len() >= 8 && bytes[..8] == [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a],
        "jpg" | "jpeg" => {
            bytes.len() >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff
        }
        "gif" => bytes.len() >= 6 && (&bytes[..6] == b"GIF87a" || &bytes[..6] == b"GIF89a"),
        "webp" => bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP",
        _ => false,
    };
    if valid {
        Ok(())
    } else {
        Err("이미지 파일 내용이 확장자와 일치하지 않습니다.".into())
    }
}

fn validate_image_magic(path: &Path, ext: &str, max_bytes: u64) -> Result<(), String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    if metadata.len() > max_bytes {
        let max_mb = max_bytes / 1024 / 1024;
        return Err(format!(
            "이미지 파일이 너무 큽니다. {max_mb}MB 이하만 저장할 수 있습니다."
        ));
    }
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut header = [0u8; 12];
    let read = file.read(&mut header).map_err(|e| e.to_string())?;
    validate_image_header_bytes(&header[..read], ext)
}

fn compatible_image_extensions(left: &str, right: &str) -> bool {
    let left = left.to_ascii_lowercase();
    let right = right.to_ascii_lowercase();
    left == right || (left == "jpg" && right == "jpeg") || (left == "jpeg" && right == "jpg")
}

fn extension_from_magic(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() >= 8 && bytes[..8] == [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a] {
        Some("png")
    } else if bytes.len() >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff {
        Some("jpeg")
    } else if bytes.len() >= 6 && (&bytes[..6] == b"GIF87a" || &bytes[..6] == b"GIF89a") {
        Some("gif")
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("webp")
    } else {
        None
    }
}

fn validate_import_filename_hint(filename: &str) -> Result<(), String> {
    let trimmed = filename.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    if trimmed != filename {
        return Err("이미지 파일명이 올바르지 않습니다.".into());
    }
    if trimmed.contains("..") || trimmed.contains('/') || trimmed.contains('\\') {
        return Err("이미지 파일명에 경로를 포함할 수 없습니다.".into());
    }
    if Path::new(trimmed).is_absolute() {
        return Err("이미지 파일명에 절대 경로를 사용할 수 없습니다.".into());
    }
    Ok(())
}
fn extension_for_image_mime(mime: &str) -> Option<&'static str> {
    match mime.trim().to_ascii_lowercase().as_str() {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpeg"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        _ => None,
    }
}

fn resolve_import_image_extension(
    filename: Option<&str>,
    mime: Option<&str>,
    bytes: &[u8],
) -> Result<String, String> {
    let magic_ext = extension_from_magic(bytes)
        .ok_or_else(|| "지원하지 않는 이미지 형식입니다.".to_string())?;

    let file_ext = filename
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .and_then(|value| {
            Path::new(value)
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.to_ascii_lowercase())
        });

    if let Some(ref ext) = file_ext {
        if !is_allowed_image_extension(ext) {
            return Err("지원하지 않는 이미지 형식입니다.".into());
        }
        if !compatible_image_extensions(ext, magic_ext) {
            return Err("이미지 파일 내용이 확장자와 일치하지 않습니다.".into());
        }
    }

    let mime_ext = mime
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .and_then(extension_for_image_mime)
        .map(str::to_string);

    if let Some(ref ext) = mime_ext {
        if !compatible_image_extensions(ext, magic_ext) {
            return Err("이미지 MIME 타입이 파일 내용과 일치하지 않습니다.".into());
        }
        if let Some(ref file_ext) = file_ext {
            if !compatible_image_extensions(ext, file_ext) {
                return Err("이미지 MIME 타입이 파일명 확장자와 일치하지 않습니다.".into());
            }
        }
    }

    Ok(file_ext
        .or(mime_ext)
        .unwrap_or_else(|| magic_ext.to_string()))
}

fn save_import_image_bytes_to_dir(
    dir: &Path,
    bytes: &[u8],
    filename: Option<&str>,
    mime: Option<&str>,
) -> Result<String, String> {
    if let Some(name) = filename {
        validate_import_filename_hint(name)?;
    }
    if bytes.is_empty() {
        return Err("이미지 데이터가 비어 있습니다.".into());
    }
    if bytes.len() as u64 > MAX_IMPORT_IMAGE_BYTES {
        let max_mb = MAX_IMPORT_IMAGE_BYTES / 1024 / 1024;
        return Err(format!(
            "이미지 파일이 너무 큽니다. {max_mb}MB 이하만 저장할 수 있습니다."
        ));
    }

    let ext = resolve_import_image_extension(filename, mime, bytes)?;
    validate_image_header_bytes(bytes, &ext)?;

    let generated = format!("{}.{}", Uuid::new_v4(), ext);
    validate_image_filename(&generated)?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    write_bytes_atomic(&dir.join(&generated), bytes)?;
    Ok(generated)
}

fn vision_image_mime(filename: &str) -> Result<&'static str, String> {
    let ext = Path::new(filename)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match ext.as_str() {
        "png" => Ok("image/png"),
        "jpg" | "jpeg" => Ok("image/jpeg"),
        "webp" => Ok("image/webp"),
        _ => Err("Gemini Vision은 PNG, JPEG, WebP 이미지만 지원합니다.".into()),
    }
}

fn gemini_inline_data_part(mime_type: &str, bytes: &[u8]) -> serde_json::Value {
    serde_json::json!({
        "inline_data": {
            "mime_type": mime_type,
            "data": BASE64_STANDARD.encode(bytes)
        }
    })
}

fn build_gemini_parts(
    app: &tauri::AppHandle,
    text: String,
    image_filenames: &[String],
) -> Result<Vec<serde_json::Value>, String> {
    if image_filenames.len() > MAX_AI_IMAGE_COUNT {
        return Err(format!(
            "AI 분석 이미지는 한 번에 {MAX_AI_IMAGE_COUNT}개 이하만 사용할 수 있습니다."
        ));
    }
    let mut parts = vec![serde_json::json!({ "text": text })];
    let mut total_bytes = 0_u64;
    for filename in image_filenames {
        let mime_type = vision_image_mime(filename)?;
        let path = image_path(app, filename)?;
        if !path.exists() {
            return Err(format!("AI 분석 이미지가 없습니다: {filename}"));
        }
        let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
        if metadata.len() > MAX_AI_IMAGE_BYTES {
            return Err(format!(
                "AI 분석 이미지는 파일당 {}MB 이하만 사용할 수 있습니다.",
                MAX_AI_IMAGE_BYTES / 1024 / 1024
            ));
        }
        total_bytes = total_bytes
            .checked_add(metadata.len())
            .ok_or_else(|| "AI 분석 이미지 용량을 계산하지 못했습니다.".to_string())?;
        if total_bytes > MAX_AI_IMAGE_TOTAL_BYTES {
            return Err("AI 분석 이미지 전체 용량은 14MB 이하여야 합니다.".into());
        }
        let ext = Path::new(filename)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        validate_image_magic(&path, ext, MAX_AI_IMAGE_BYTES)?;
        let bytes =
            fs::read(&path).map_err(|e| format!("AI 분석 이미지를 읽지 못했습니다: {e}"))?;
        parts.push(gemini_inline_data_part(mime_type, &bytes));
    }
    Ok(parts)
}

fn collect_entry_images(entry: &WrongAnswerEntry) -> Vec<String> {
    notebook_store::collect_entry_image_filenames(entry)
        .into_iter()
        .collect()
}

fn write_entries_json_atomic(path: &Path, entries: &[WrongAnswerEntry]) -> Result<(), String> {
    let dir = path
        .parent()
        .ok_or_else(|| "저장 경로를 확인할 수 없습니다.".to_string())?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let document = StoredEntriesDocument {
        schema_version: ENTRIES_SCHEMA_VERSION,
        entries: entries.to_vec(),
    };
    let json = serde_json::to_string_pretty(&document).map_err(|e| e.to_string())?;
    let mut tmp = tempfile::NamedTempFile::new_in(dir).map_err(|e| e.to_string())?;
    tmp.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
    tmp.flush().map_err(|e| e.to_string())?;
    tmp.persist(path).map_err(|e| e.error.to_string())?;
    Ok(())
}

fn write_json_atomic(path: &Path, value: &serde_json::Value) -> Result<(), String> {
    let dir = path
        .parent()
        .ok_or_else(|| "저장 경로를 확인할 수 없습니다.".to_string())?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    let mut tmp = tempfile::NamedTempFile::new_in(dir).map_err(|e| e.to_string())?;
    tmp.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
    tmp.flush().map_err(|e| e.to_string())?;
    tmp.persist(path).map_err(|e| e.error.to_string())?;
    Ok(())
}

pub(crate) fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let dir = path
        .parent()
        .ok_or_else(|| "저장 경로를 확인할 수 없습니다.".to_string())?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let mut tmp = tempfile::NamedTempFile::new_in(dir).map_err(|e| e.to_string())?;
    tmp.write_all(bytes).map_err(|e| e.to_string())?;
    tmp.flush().map_err(|e| e.to_string())?;
    tmp.persist(path).map_err(|e| e.error.to_string())?;
    Ok(())
}

fn load_entries_raw(app: &tauri::AppHandle) -> Result<String, String> {
    let path = data_file(app)?;
    if path.exists() {
        fs::read_to_string(path).map_err(|e| e.to_string())
    } else {
        Ok("[]".into())
    }
}

fn load_settings_raw(app: &tauri::AppHandle) -> Result<String, String> {
    let path = settings_file(app)?;
    if path.exists() {
        fs::read_to_string(path).map_err(|e| e.to_string())
    } else {
        Ok(r#"{"templates":[],"autoBackup":{"enabled":false}}"#.into())
    }
}

fn has_env_ai_key() -> bool {
    std::env::var("GOOGLE_API_KEY")
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false)
        || std::env::var("GEMINI_API_KEY")
            .map(|v| !v.trim().is_empty())
            .unwrap_or(false)
}

fn legacy_ai_provider_key(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let path = ai_provider_key_file(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let key = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let trimmed = key.trim().to_string();
    if trimmed.is_empty() {
        Ok(None)
    } else {
        Ok(Some(trimmed))
    }
}

fn remove_legacy_ai_provider_key(app: &tauri::AppHandle) {
    if let Ok(path) = ai_provider_key_file(app) {
        let _ = fs::remove_file(path);
    }
}

fn stored_ai_provider_key() -> Result<Option<String>, String> {
    match ai_provider_key_entry()?.get_password() {
        Ok(key) => {
            let trimmed = key.trim().to_string();
            if trimmed.is_empty() {
                Ok(None)
            } else {
                Ok(Some(trimmed))
            }
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("저장된 Gemini API key를 읽지 못했습니다: {e}")),
    }
}

fn has_stored_ai_provider_key(app: &tauri::AppHandle) -> bool {
    stored_ai_provider_key()
        .map(|key| key.is_some())
        .unwrap_or(false)
        || legacy_ai_provider_key(app)
            .map(|key| key.is_some())
            .unwrap_or(false)
}

fn save_stored_ai_provider_key(app: &tauri::AppHandle, api_key: &str) -> Result<(), String> {
    ai_provider_key_entry()?
        .set_password(api_key)
        .map_err(|e| format!("Gemini API key를 OS 보안 저장소에 저장하지 못했습니다: {e}"))?;
    remove_legacy_ai_provider_key(app);
    Ok(())
}

fn clear_stored_ai_provider_key(app: &tauri::AppHandle) -> Result<(), String> {
    match ai_provider_key_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {
            remove_legacy_ai_provider_key(app);
            Ok(())
        }
        Err(e) => Err(format!("저장된 Gemini API key를 삭제하지 못했습니다: {e}")),
    }
}

fn read_stored_ai_provider_key(app: &tauri::AppHandle) -> Result<String, String> {
    if let Some(key) = stored_ai_provider_key()? {
        return Ok(key);
    }
    if let Some(key) = legacy_ai_provider_key(app)? {
        save_stored_ai_provider_key(app, &key)?;
        return Ok(key);
    }
    Err("저장된 Gemini API key를 찾지 못했습니다.".into())
}

fn load_ai_provider_config(app: &tauri::AppHandle) -> AiProviderConfig {
    let raw = load_settings_raw(app).unwrap_or_else(|_| "{}".into());
    let value: serde_json::Value =
        serde_json::from_str(&raw).unwrap_or_else(|_| serde_json::json!({}));
    let mut config = value
        .get("aiProvider")
        .cloned()
        .and_then(|item| serde_json::from_value::<AiProviderConfig>(item).ok())
        .unwrap_or_else(default_ai_provider_config);
    config.has_stored_key = has_stored_ai_provider_key(app);
    if matches!(config.provider_type, AiProviderType::Manual) {
        config.enabled = false;
    }
    config
}

fn save_ai_provider_config_to_settings(
    app: &tauri::AppHandle,
    config: &AiProviderConfig,
) -> Result<(), String> {
    let raw = load_settings_raw(app)?;
    let mut value: serde_json::Value =
        serde_json::from_str(&raw).unwrap_or_else(|_| serde_json::json!({}));
    if !value.is_object() {
        value = serde_json::json!({});
    }
    let mut public_config = serde_json::to_value(config).map_err(|e| e.to_string())?;
    if let Some(obj) = public_config.as_object_mut() {
        obj.insert(
            "hasStoredKey".into(),
            serde_json::Value::Bool(config.has_stored_key),
        );
    }
    value["aiProvider"] = public_config;
    write_json_atomic(&settings_file(app)?, &value)
}

fn ai_provider_status(app: &tauri::AppHandle) -> AiProviderStatus {
    let config = load_ai_provider_config(app);
    let has_env_key = has_env_ai_key();
    let has_key = match config.key_source {
        AiProviderKeySource::Env => has_env_key,
        AiProviderKeySource::TauriSettings => config.has_stored_key,
    };
    let available =
        config.enabled && !matches!(config.provider_type, AiProviderType::Manual) && has_key;
    AiProviderStatus {
        provider_type: config.provider_type,
        enabled: config.enabled,
        key_source: config.key_source,
        has_stored_key: config.has_stored_key,
        has_env_key,
        available,
        message: if available {
            None
        } else {
            Some("manual provider 대기 상태입니다.".into())
        },
    }
}

fn ai_provider_key(app: &tauri::AppHandle, config: &AiProviderConfig) -> Result<String, String> {
    match config.key_source {
        AiProviderKeySource::Env => std::env::var("GOOGLE_API_KEY")
            .or_else(|_| std::env::var("GEMINI_API_KEY"))
            .map(|key| key.trim().to_string())
            .map_err(|_| "Gemini API key 환경변수를 찾지 못했습니다.".to_string()),
        AiProviderKeySource::TauriSettings => read_stored_ai_provider_key(app),
    }
}

fn gemini_model(provider: &AiProviderType) -> &'static str {
    match provider {
        AiProviderType::Manual => "",
        AiProviderType::GeminiFlashLite => "gemini-2.5-flash-lite",
        AiProviderType::Gemini35Flash => "gemini-3.5-flash",
    }
}

fn extract_gemini_text(value: serde_json::Value) -> Result<String, String> {
    let candidates = value
        .get("candidates")
        .and_then(|item| item.as_array())
        .ok_or_else(|| "Gemini 응답에 candidates가 없습니다.".to_string())?;
    for candidate in candidates {
        if let Some(parts) = candidate
            .get("content")
            .and_then(|content| content.get("parts"))
            .and_then(|parts| parts.as_array())
        {
            let text = parts
                .iter()
                .filter_map(|part| part.get("text").and_then(|text| text.as_str()))
                .collect::<Vec<_>>()
                .join("\n");
            if !text.trim().is_empty() {
                return Ok(text);
            }
        }
    }
    Err("Gemini 응답에서 텍스트를 찾지 못했습니다.".into())
}

fn unix_time_string() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".into())
}

#[tauri::command]
fn load_entries(
    store: tauri::State<'_, Arc<notebook_store::NotebookStore>>,
) -> Result<Vec<WrongAnswerEntry>, String> {
    store.load_entries()
}

fn parse_entries_value(value: serde_json::Value) -> Result<Vec<WrongAnswerEntry>, String> {
    if value.is_array() {
        return serde_json::from_value(value).map_err(|e| e.to_string());
    }
    let version = value
        .get("schemaVersion")
        .and_then(|value| value.as_u64())
        .ok_or_else(|| "저장 데이터 schemaVersion을 확인할 수 없습니다.".to_string())?;
    if version != ENTRIES_SCHEMA_VERSION as u64 {
        return Err(format!(
            "지원하지 않는 저장 데이터 schemaVersion입니다: {version}"
        ));
    }
    let entries = value
        .get("entries")
        .cloned()
        .ok_or_else(|| "저장 데이터에 entries가 없습니다.".to_string())?;
    serde_json::from_value(entries).map_err(|e| e.to_string())
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
    let path = app_dir(&app)?.join("exam-sessions.json");
    if !path.exists() {
        return Ok(serde_json::json!([]));
    }
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_exam_sessions(app: tauri::AppHandle, sessions: serde_json::Value) -> Result<(), String> {
    write_json_atomic(&app_dir(&app)?.join("exam-sessions.json"), &sessions)
}

fn data_schema_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join("data-schema.json"))
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
        parse_entries_value(document)?;
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

fn collect_workspace_files(
    root: &Path,
    current: &Path,
    output: &mut Vec<(String, PathBuf)>,
) -> Result<(), String> {
    if !current.exists() {
        return Ok(());
    }
    for item in fs::read_dir(current).map_err(|e| e.to_string())? {
        let path = item.map_err(|e| e.to_string())?.path();
        if path.is_dir() {
            collect_workspace_files(root, &path, output)?;
            continue;
        }
        let relative = path.strip_prefix(root).map_err(|e| e.to_string())?;
        let name = Path::new("import-workspaces")
            .join(relative)
            .to_string_lossy()
            .replace('\\', "/");
        output.push((name, path));
    }
    Ok(())
}

#[tauri::command]
fn load_generated_exams(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = app_dir(&app)?.join("generated-exams.json");
    if !path.exists() {
        return Ok(serde_json::json!([]));
    }
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_generated_exams(app: tauri::AppHandle, exams: serde_json::Value) -> Result<(), String> {
    write_json_atomic(&app_dir(&app)?.join("generated-exams.json"), &exams)
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

#[tauri::command]
fn get_ai_provider_status(app: tauri::AppHandle) -> Result<AiProviderStatus, String> {
    Ok(ai_provider_status(&app))
}

#[tauri::command]
fn save_ai_provider_config(
    app: tauri::AppHandle,
    mut config: AiProviderConfig,
) -> Result<AiProviderStatus, String> {
    config.has_stored_key = has_stored_ai_provider_key(&app);
    if matches!(config.provider_type, AiProviderType::Manual) {
        config.enabled = false;
    }
    save_ai_provider_config_to_settings(&app, &config)?;
    Ok(ai_provider_status(&app))
}

#[tauri::command]
fn save_ai_provider_key(
    app: tauri::AppHandle,
    api_key: String,
) -> Result<AiProviderStatus, String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err("API key가 비어 있습니다.".into());
    }
    save_stored_ai_provider_key(&app, trimmed)?;
    let mut config = load_ai_provider_config(&app);
    config.has_stored_key = true;
    save_ai_provider_config_to_settings(&app, &config)?;
    Ok(ai_provider_status(&app))
}

#[tauri::command]
fn clear_ai_provider_key(app: tauri::AppHandle) -> Result<AiProviderStatus, String> {
    clear_stored_ai_provider_key(&app)?;
    let mut config = load_ai_provider_config(&app);
    config.has_stored_key = false;
    save_ai_provider_config_to_settings(&app, &config)?;
    Ok(ai_provider_status(&app))
}

#[tauri::command]
fn generate_import_with_ai(
    app: tauri::AppHandle,
    prompt: String,
    input_text: String,
    image_filenames: Vec<String>,
) -> Result<String, String> {
    let config = load_ai_provider_config(&app);
    if !config.enabled || matches!(config.provider_type, AiProviderType::Manual) {
        return Err("AI provider가 비활성화되어 있습니다.".into());
    }
    let key = ai_provider_key(&app, &config)?;
    let model = gemini_model(&config.provider_type);
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
        model
    );
    let text = if input_text.trim().is_empty() {
        prompt
    } else {
        format!("{}\n\n입력:\n{}", prompt, input_text)
    };
    let parts = build_gemini_parts(&app, text, &image_filenames)?;
    let body = serde_json::json!({
        "contents": [
            {
                "role": "user",
                "parts": parts
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json"
        }
    });
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|e| format!("Gemini HTTP client를 만들지 못했습니다: {e}"))?;
    let response = client
        .post(url)
        .header("x-goog-api-key", key)
        .json(&body)
        .send()
        .map_err(|e| format!("Gemini 호출에 실패했습니다: {e}"))?;
    let status = response.status();
    let value: serde_json::Value = response
        .json()
        .map_err(|e| format!("Gemini 응답 JSON을 읽지 못했습니다: {e}"))?;
    if !status.is_success() {
        let message = value
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(|message| message.as_str())
            .unwrap_or("Gemini API 오류");
        return Err(format!("Gemini API 오류({status}): {message}"));
    }
    extract_gemini_text(value)
}

#[tauri::command]
fn save_import_image_bytes(
    app: tauri::AppHandle,
    bytes: Vec<u8>,
    filename: Option<String>,
    mime: Option<String>,
) -> Result<String, String> {
    save_import_image_bytes_to_dir(
        &images_dir(&app)?,
        &bytes,
        filename.as_deref(),
        mime.as_deref(),
    )
}

#[tauri::command]
fn save_image(app: tauri::AppHandle, source_path: String) -> Result<String, String> {
    let ext = std::path::Path::new(&source_path)
        .extension()
        .and_then(|e| e.to_str())
        .ok_or_else(|| "이미지 확장자를 확인할 수 없습니다.".to_string())?
        .to_ascii_lowercase();
    if !is_allowed_image_extension(&ext) {
        return Err("지원하지 않는 이미지 형식입니다.".into());
    }
    validate_image_magic(Path::new(&source_path), &ext, MAX_IMPORT_IMAGE_BYTES)?;
    let filename = format!("{}.{}", Uuid::new_v4(), ext);
    let dest = image_path(&app, &filename)?;
    fs::copy(&source_path, &dest).map_err(|e| e.to_string())?;
    Ok(filename)
}

#[tauri::command]
fn get_image_file_path(app: tauri::AppHandle, filename: String) -> Result<String, String> {
    let path = image_path(&app, &filename)?;
    if !path.exists() {
        return Err("이미지를 찾을 수 없습니다.".into());
    }
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn delete_image(
    app: tauri::AppHandle,
    store: tauri::State<'_, Arc<notebook_store::NotebookStore>>,
    filename: String,
) -> Result<(), String> {
    if store.is_referenced_image(&filename)? {
        return Err("다른 학습 항목에서 참조 중인 이미지는 삭제할 수 없습니다.".into());
    }
    let path = image_path(&app, &filename)?;
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn create_backup_zip(app: tauri::AppHandle, backup_path: String) -> Result<(), String> {
    create_backup_zip_at(&app, Path::new(&backup_path))
}

fn create_backup_zip_at(app: &tauri::AppHandle, backup_path: &Path) -> Result<(), String> {
    let entries = load_entries_raw(app)?;
    let settings = load_settings_raw(app)?;
    if entries.len() as u64 > MAX_BACKUP_JSON_BYTES || settings.len() as u64 > MAX_BACKUP_JSON_BYTES
    {
        return Err("백업 데이터 JSON이 허용 용량을 초과했습니다.".into());
    }
    let image_dir = images_dir(app)?;
    let mut images: Vec<(String, PathBuf, u64)> = Vec::new();
    let mut total_image_bytes = 0u64;
    if image_dir.exists() {
        for item in fs::read_dir(&image_dir).map_err(|e| e.to_string())? {
            let path = item.map_err(|e| e.to_string())?.path();
            if !path.is_file() {
                continue;
            }
            let Some(filename) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if validate_image_filename(filename).is_err() {
                continue;
            }
            let ext = path
                .extension()
                .and_then(|value| value.to_str())
                .ok_or_else(|| format!("{filename} 이미지 확장자를 확인할 수 없습니다."))?;
            validate_image_magic(&path, ext, MAX_IMPORT_IMAGE_BYTES)?;
            let size = fs::metadata(&path).map_err(|e| e.to_string())?.len();
            if size > MAX_IMPORT_IMAGE_BYTES {
                return Err(format!(
                    "{filename} 이미지가 {}MB 제한을 초과했습니다.",
                    MAX_IMPORT_IMAGE_BYTES / 1024 / 1024
                ));
            }
            total_image_bytes = total_image_bytes
                .checked_add(size)
                .ok_or_else(|| "백업 이미지 용량을 계산하지 못했습니다.".to_string())?;
            if total_image_bytes > MAX_BACKUP_TOTAL_IMAGE_BYTES {
                return Err("백업 이미지 전체 용량이 1GB 제한을 초과했습니다.".into());
            }
            images.push((filename.to_string(), path, size));
        }
    }
    if images.len() + 3 > MAX_BACKUP_ENTRY_COUNT {
        return Err("백업에 포함할 파일이 너무 많습니다.".into());
    }

    let temp_path = backup_path.with_extension(format!("zip.tmp-{}", Uuid::new_v4()));
    let file = fs::File::create(&temp_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("entries.json", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(entries.as_bytes())
        .map_err(|e| e.to_string())?;

    zip.start_file("settings.json", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(settings.as_bytes())
        .map_err(|e| e.to_string())?;

    for filename in PERSISTENT_DATA_FILES
        .iter()
        .copied()
        .filter(|name| *name != "entries.json" && *name != "settings.json")
    {
        let path = app_dir(app)?.join(filename);
        if !path.is_file() {
            continue;
        }
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        if bytes.len() as u64 > MAX_BACKUP_JSON_BYTES {
            return Err(format!("{filename} 파일이 백업 허용 용량을 초과했습니다."));
        }
        zip.start_file(filename, options)
            .map_err(|e| e.to_string())?;
        zip.write_all(&bytes).map_err(|e| e.to_string())?;
    }

    let workspace_root = app_dir(app)?.join("import-workspaces");
    let mut workspace_files = Vec::new();
    collect_workspace_files(&workspace_root, &workspace_root, &mut workspace_files)?;
    for (archive_name, path) in workspace_files {
        let size = fs::metadata(&path).map_err(|e| e.to_string())?.len();
        if size > MAX_BACKUP_JSON_BYTES {
            return Err(format!(
                "{archive_name} 파일이 백업 허용 용량을 초과했습니다."
            ));
        }
        zip.start_file(&archive_name, options)
            .map_err(|e| e.to_string())?;
        let mut source = fs::File::open(path).map_err(|e| e.to_string())?;
        std::io::copy(&mut source, &mut zip).map_err(|e| e.to_string())?;
    }

    let mut included_files = vec!["entries.json", "settings.json", "backup-meta.json"];
    included_files.extend(
        PERSISTENT_DATA_FILES
            .iter()
            .copied()
            .filter(|name| *name != "entries.json" && *name != "settings.json"),
    );
    let meta = serde_json::json!({
        "backupFormat": 2,
        "appVersion": env!("CARGO_PKG_VERSION"),
        "dataSchemaVersion": CURRENT_DATA_SCHEMA_VERSION,
        "createdAt": unix_time_string(),
        "source": "tauri",
        "includedFiles": included_files,
        "includesImages": true,
        "includesImportWorkspaces": workspace_root.exists(),
    });
    zip.start_file("backup-meta.json", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(
        serde_json::to_string_pretty(&meta)
            .map_err(|e| e.to_string())?
            .as_bytes(),
    )
    .map_err(|e| e.to_string())?;

    for (filename, path, _) in images {
        zip.start_file(format!("images/{filename}"), options)
            .map_err(|e| e.to_string())?;
        let mut image = fs::File::open(&path).map_err(|e| e.to_string())?;
        std::io::copy(&mut image, &mut zip).map_err(|e| e.to_string())?;
    }

    zip.finish().map_err(|e| e.to_string())?;
    if fs::metadata(&temp_path).map_err(|e| e.to_string())?.len() > MAX_BACKUP_ZIP_BYTES {
        let _ = fs::remove_file(&temp_path);
        return Err("완성된 백업 ZIP이 1GB 제한을 초과했습니다.".into());
    }
    fs::rename(&temp_path, backup_path).map_err(|error| {
        let _ = fs::remove_file(&temp_path);
        error.to_string()
    })?;
    Ok(())
}

#[tauri::command]
fn create_auto_backup(app: tauri::AppHandle) -> Result<String, String> {
    let backup_dir = app_dir(&app)?.join("backups");
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    let backup_path = backup_dir.join(format!("auto-backup-{}.zip", unix_time_string()));
    create_backup_zip_at(&app, &backup_path)?;

    let mut backups: Vec<PathBuf> = fs::read_dir(&backup_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|item| item.ok().map(|entry| entry.path()))
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("zip"))
        .collect();
    backups.sort();
    while backups.len() > 10 {
        if let Some(path) = backups.first().cloned() {
            fs::remove_file(path).map_err(|e| e.to_string())?;
            backups.remove(0);
        }
    }

    Ok(backup_path.to_string_lossy().to_string())
}

#[tauri::command]
fn create_pre_update_backup(
    app: tauri::AppHandle,
    from_version: String,
    to_version: String,
) -> Result<String, String> {
    let backup_dir = app_dir(&app)?.join("backups");
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    let path = backup_dir.join(format!(
        "pre-update-{from_version}-to-{to_version}-{}.zip",
        unix_time_string()
    ));
    create_backup_zip_at(&app, &path)?;
    let mut backups: Vec<PathBuf> = fs::read_dir(&backup_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|item| item.ok().map(|entry| entry.path()))
        .filter(|item| {
            item.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("pre-update-") && name.ends_with(".zip"))
        })
        .collect();
    backups.sort();
    while backups.len() > 3 {
        if let Some(oldest) = backups.first().cloned() {
            fs::remove_file(oldest).map_err(|e| e.to_string())?;
            backups.remove(0);
        }
    }
    Ok(path.to_string_lossy().to_string())
}

fn remove_restore_path(path: &Path) -> Result<(), String> {
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

fn rollback_restore_paths(moved: &[(PathBuf, PathBuf)]) -> Result<(), String> {
    for (original, backup) in moved.iter().rev() {
        remove_restore_path(original)?;
        if backup.exists() {
            if let Some(parent) = original.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::rename(backup, original).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn restore_backup_zip(
    app: tauri::AppHandle,
    store: tauri::State<'_, Arc<notebook_store::NotebookStore>>,
    backup_path: String,
) -> Result<(), String> {
    let backup_metadata = fs::metadata(&backup_path).map_err(|e| e.to_string())?;
    if backup_metadata.len() > MAX_BACKUP_ZIP_BYTES {
        return Err(format!(
            "백업 ZIP 파일이 너무 큽니다. {}MB 이하만 복원할 수 있습니다.",
            MAX_BACKUP_ZIP_BYTES / 1024 / 1024
        ));
    }
    let file = fs::File::open(&backup_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    if archive.len() > MAX_BACKUP_ENTRY_COUNT {
        return Err("백업 ZIP 안의 파일이 너무 많습니다.".into());
    }
    let app_dir = app_dir(&app)?;
    let image_dir = images_dir(&app)?;
    let mut restored_entries: Option<Vec<WrongAnswerEntry>> = None;
    let mut settings_json: Option<serde_json::Value> = None;
    let mut optional_files: Vec<(String, Vec<u8>)> = Vec::new();
    let mut images: Vec<(String, Vec<u8>)> = Vec::new();
    let mut workspace_files: Vec<(String, Vec<u8>)> = Vec::new();
    let mut total_image_bytes = 0u64;

    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|e| e.to_string())?;
        let name = file.name().to_string();
        if name == "entries.json" || name == "settings.json" {
            if file.size() > MAX_BACKUP_JSON_BYTES {
                return Err(format!("{name} 파일이 너무 큽니다."));
            }
            let mut content = String::new();
            file.read_to_string(&mut content)
                .map_err(|e| e.to_string())?;
            let value: serde_json::Value =
                serde_json::from_str(&content).map_err(|e| e.to_string())?;
            if name == "entries.json" {
                restored_entries = Some(parse_entries_value(value)?);
            } else {
                settings_json = Some(value);
            }
        } else if PERSISTENT_DATA_FILES.contains(&name.as_str()) {
            if file.size() > MAX_BACKUP_JSON_BYTES {
                return Err(format!("{name} 파일이 너무 큽니다."));
            }
            let mut bytes = Vec::new();
            file.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
            if name == "data-schema.json" {
                let value: serde_json::Value =
                    serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
                if value
                    .get("schemaVersion")
                    .and_then(serde_json::Value::as_u64)
                    != Some(CURRENT_DATA_SCHEMA_VERSION as u64)
                {
                    return Err("백업의 데이터 스키마 버전이 지원되지 않습니다.".into());
                }
            }
            optional_files.push((name, bytes));
        } else if let Some(filename) = name.strip_prefix("images/") {
            if filename.contains('/') || filename.is_empty() {
                continue;
            }
            validate_image_filename(filename)?;
            if file.size() > MAX_IMPORT_IMAGE_BYTES {
                return Err(format!(
                    "{filename} 이미지가 {}MB 제한을 초과했습니다.",
                    MAX_IMPORT_IMAGE_BYTES / 1024 / 1024
                ));
            }
            total_image_bytes = total_image_bytes
                .checked_add(file.size())
                .ok_or_else(|| "백업 이미지 용량을 계산하지 못했습니다.".to_string())?;
            if total_image_bytes > MAX_BACKUP_TOTAL_IMAGE_BYTES {
                return Err("백업 ZIP 안의 이미지 전체 용량이 너무 큽니다.".into());
            }
            let mut bytes = Vec::new();
            file.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
            let ext = Path::new(filename)
                .extension()
                .and_then(|e| e.to_str())
                .ok_or_else(|| "이미지 확장자를 확인할 수 없습니다.".to_string())?;
            validate_image_header_bytes(&bytes, ext)?;
            images.push((filename.to_string(), bytes));
        } else if let Some(relative) = name.strip_prefix("import-workspaces/") {
            if relative.is_empty()
                || relative.contains("..")
                || Path::new(relative).is_absolute()
                || relative.contains('\\')
            {
                return Err("백업 작업실 경로가 올바르지 않습니다.".into());
            }
            if file.size() > MAX_BACKUP_JSON_BYTES {
                return Err(format!("{name} 파일이 너무 큽니다."));
            }
            let mut bytes = Vec::new();
            file.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
            if relative.ends_with(".json") {
                serde_json::from_slice::<serde_json::Value>(&bytes)
                    .map_err(|e| format!("백업 작업실 JSON이 올바르지 않습니다: {e}"))?;
            }
            workspace_files.push((relative.to_string(), bytes));
        }
    }

    let restored_entries =
        restored_entries.ok_or_else(|| "백업 ZIP에 entries.json이 없습니다.".to_string())?;
    let rollback_dir = app_dir.join(format!(".restore-rollback-{}", Uuid::new_v4()));
    fs::create_dir_all(&rollback_dir).map_err(|e| e.to_string())?;
    let mut moved: Vec<(PathBuf, PathBuf)> = Vec::new();
    let mut move_target = |target: PathBuf, label: &str| -> Result<(), String> {
        if !target.exists() {
            return Ok(());
        }
        let backup = rollback_dir.join(label);
        fs::rename(&target, &backup).map_err(|e| e.to_string())?;
        moved.push((target, backup));
        Ok(())
    };
    let move_result = (|| -> Result<(), String> {
        move_target(data_file(&app)?, "entries.json")?;
        if settings_json.is_some() {
            move_target(settings_file(&app)?, "settings.json")?;
        }
        for (name, _) in &optional_files {
            move_target(
                app_dir.join(name),
                &format!("optional-{}", name.replace('/', "_")),
            )?;
        }
        // Replace managed directories even when the backup contains no files;
        // otherwise stale images/workspaces survive a restore.
        move_target(image_dir.clone(), "images")?;
        move_target(app_dir.join("import-workspaces"), "import-workspaces")?;
        Ok(())
    })();
    drop(move_target);
    if let Err(error) = move_result {
        let rollback_error = rollback_restore_paths(&moved).err();
        let _ = fs::remove_dir_all(&rollback_dir);
        return Err(match rollback_error {
            Some(rollback) => format!("{error} 복원 rollback 실패: {rollback}"),
            None => error,
        });
    }

    let commit_result = (|| -> Result<(), String> {
        store.save_entries(&restored_entries)?;
        if let Some(settings_json) = settings_json {
            write_json_atomic(&settings_file(&app)?, &settings_json)?;
        }
        for (name, bytes) in &optional_files {
            write_bytes_atomic(&app_dir.join(name), bytes)?;
        }
        for (filename, bytes) in &images {
            write_bytes_atomic(&image_dir.join(filename), bytes)?;
        }
        for (relative, bytes) in &workspace_files {
            write_bytes_atomic(&app_dir.join("import-workspaces").join(relative), bytes)?;
        }
        fs::create_dir_all(&image_dir).map_err(|e| e.to_string())?;
        fs::create_dir_all(app_dir.join("import-workspaces")).map_err(|e| e.to_string())?;
        Ok(())
    })();
    if let Err(error) = commit_result {
        let rollback_error = rollback_restore_paths(&moved).err();
        let _ = fs::remove_dir_all(&rollback_dir);
        return Err(match rollback_error {
            Some(rollback) => format!("{error} 복원 rollback 실패: {rollback}"),
            None => error,
        });
    }
    // Data has already been restored successfully. Cleanup failure must not
    // report a false restore failure or trigger a second restore attempt.
    let _ = fs::remove_dir_all(&rollback_dir);
    Ok(())
}

#[tauri::command]
fn run_integrity_check(
    app: tauri::AppHandle,
    store: tauri::State<'_, Arc<notebook_store::NotebookStore>>,
) -> Result<IntegrityReport, String> {
    let entries = store.load_entries()?;
    let image_dir = images_dir(&app)?;
    let referenced: HashSet<String> = entries.iter().flat_map(collect_entry_images).collect();

    let mut issues = Vec::new();
    if image_dir.exists() {
        for item in fs::read_dir(&image_dir).map_err(|e| e.to_string())? {
            let path = item.map_err(|e| e.to_string())?.path();
            let Some(filename) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if !referenced.contains(filename) {
                issues.push(IntegrityIssue {
                    id: format!("orphan-image-{filename}"),
                    severity: "info".into(),
                    message: format!("사용하지 않는 이미지가 있습니다: {filename}"),
                    entry_id: None,
                });
            }
        }
    }

    for entry in entries {
        for filename in collect_entry_images(&entry) {
            if validate_image_filename(&filename).is_ok() && !image_dir.join(&filename).exists() {
                issues.push(IntegrityIssue {
                    id: format!("missing-image-{}-{filename}", entry.id),
                    severity: "warning".into(),
                    message: format!("\"{}\" 항목의 이미지가 누락되었습니다.", entry.title),
                    entry_id: Some(entry.id.clone()),
                });
            }
        }
    }

    Ok(IntegrityReport {
        checked_at: unix_time_string(),
        issues,
    })
}

#[tauri::command]
fn cleanup_orphan_images(
    app: tauri::AppHandle,
    store: tauri::State<'_, Arc<notebook_store::NotebookStore>>,
) -> Result<usize, String> {
    let referenced = store.referenced_image_filenames()?;
    let image_dir = images_dir(&app)?;
    let mut removed = 0;
    for item in fs::read_dir(image_dir).map_err(|e| e.to_string())? {
        let path = item.map_err(|e| e.to_string())?.path();
        let Some(filename) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if !referenced.contains(filename) && validate_image_filename(filename).is_ok() {
            fs::remove_file(path).map_err(|e| e.to_string())?;
            removed += 1;
        }
    }
    Ok(removed)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OrphanImagePreview {
    filenames: Vec<String>,
    total_bytes: u64,
}

#[tauri::command]
fn preview_orphan_images(
    app: tauri::AppHandle,
    store: tauri::State<'_, Arc<notebook_store::NotebookStore>>,
) -> Result<OrphanImagePreview, String> {
    let referenced = store.referenced_image_filenames()?;
    let image_dir = images_dir(&app)?;
    let mut filenames = Vec::new();
    let mut total_bytes = 0u64;
    if image_dir.exists() {
        for item in fs::read_dir(image_dir).map_err(|e| e.to_string())? {
            let path = item.map_err(|e| e.to_string())?.path();
            let Some(filename) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if validate_image_filename(filename).is_err() || referenced.contains(filename) {
                continue;
            }
            total_bytes = total_bytes
                .checked_add(fs::metadata(&path).map_err(|e| e.to_string())?.len())
                .ok_or_else(|| "이미지 용량을 계산하지 못했습니다.".to_string())?;
            filenames.push(filename.to_owned());
        }
    }
    filenames.sort();
    Ok(OrphanImagePreview {
        filenames,
        total_bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert_eq!(MAX_AI_IMAGE_BYTES, 10 * 1024 * 1024);
        assert_eq!(MAX_AI_IMAGE_COUNT, 20);
        assert_eq!(MAX_AI_IMAGE_TOTAL_BYTES, 14 * 1024 * 1024);
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
        assert_eq!(vision_image_mime("page.png").unwrap(), "image/png");
        assert_eq!(vision_image_mime("page.JPG").unwrap(), "image/jpeg");
        assert_eq!(vision_image_mime("page.webp").unwrap(), "image/webp");
        assert!(vision_image_mime("page.gif").is_err());
    }

    #[test]
    fn builds_gemini_inline_data_part() {
        let part = gemini_inline_data_part("image/png", b"png");
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

        assert!(collect_entry_images(&entry).contains(&"figure.png".to_string()));
        assert!(collect_entry_images(&entry).contains(&"source-page.png".to_string()));
        assert!(collect_entry_images(&entry).contains(&"block.png".to_string()));
        assert!(collect_entry_images(&entry).contains(&"figure-source.png".to_string()));
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

        write_entries_json_atomic(&path, &entries).expect("write entries");

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
            load_settings,
            save_settings,
            get_ai_provider_status,
            save_ai_provider_config,
            save_ai_provider_key,
            clear_ai_provider_key,
            generate_import_with_ai,
            save_import_image_bytes,
            save_image,
            get_image_file_path,
            delete_image,
            create_backup_zip,
            create_auto_backup,
            create_pre_update_backup,
            restore_backup_zip,
            run_integrity_check,
            cleanup_orphan_images,
            preview_orphan_images,
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
