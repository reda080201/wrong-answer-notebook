use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::{
    app_dir, image_path, load_settings_raw, settings_file, validate_image_magic, write_json_atomic,
};

pub(crate) const MAX_AI_IMAGE_BYTES: u64 = 10 * 1024 * 1024;
pub(crate) const MAX_AI_IMAGE_COUNT: usize = 20;
pub(crate) const MAX_AI_IMAGE_TOTAL_BYTES: u64 = 14 * 1024 * 1024;
const AI_KEYRING_SERVICE: &str = "wrong-answer-notebook";
const AI_KEYRING_USER: &str = "gemini-api-key";

fn ai_provider_key_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join("ai_provider_key.txt"))
}

fn ai_provider_key_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(AI_KEYRING_SERVICE, AI_KEYRING_USER)
        .map_err(|error| format!("OS 보안 저장소를 열지 못했습니다: {error}"))
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub(crate) enum AiProviderType {
    #[serde(rename = "manual")]
    Manual,
    #[serde(rename = "gemini-flash-lite")]
    GeminiFlashLite,
    #[serde(rename = "gemini-3.5-flash")]
    Gemini35Flash,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub(crate) enum AiProviderKeySource {
    #[serde(rename = "env")]
    Env,
    #[serde(rename = "tauri-settings")]
    TauriSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiProviderConfig {
    #[serde(rename = "type")]
    provider_type: AiProviderType,
    enabled: bool,
    key_source: AiProviderKeySource,
    #[serde(default)]
    has_stored_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiProviderStatus {
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

pub(crate) fn vision_image_mime(filename: &str) -> Result<&'static str, String> {
    let extension = Path::new(filename)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "png" => Ok("image/png"),
        "jpg" | "jpeg" => Ok("image/jpeg"),
        "webp" => Ok("image/webp"),
        _ => Err("Gemini Vision은 PNG, JPEG, WebP 이미지만 지원합니다.".into()),
    }
}

pub(crate) fn gemini_inline_data_part(mime_type: &str, bytes: &[u8]) -> serde_json::Value {
    serde_json::json!({
        "inline_data": {
            "mime_type": mime_type,
            "data": BASE64_STANDARD.encode(bytes),
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

        let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
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

        let extension = Path::new(filename)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        validate_image_magic(&path, extension, MAX_AI_IMAGE_BYTES)?;
        let bytes = fs::read(&path)
            .map_err(|error| format!("AI 분석 이미지를 읽지 못했습니다: {error}"))?;
        parts.push(gemini_inline_data_part(mime_type, &bytes));
    }

    Ok(parts)
}

fn has_env_ai_key() -> bool {
    std::env::var("GOOGLE_API_KEY")
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
        || std::env::var("GEMINI_API_KEY")
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false)
}

fn legacy_ai_provider_key(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let path = ai_provider_key_file(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let key = fs::read_to_string(&path).map_err(|error| error.to_string())?;
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
        Err(error) => Err(format!("저장된 Gemini API key를 읽지 못했습니다: {error}")),
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
        .map_err(|error| {
            format!("Gemini API key를 OS 보안 저장소에 저장하지 못했습니다: {error}")
        })?;
    remove_legacy_ai_provider_key(app);
    Ok(())
}

fn clear_stored_ai_provider_key(app: &tauri::AppHandle) -> Result<(), String> {
    match ai_provider_key_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {
            remove_legacy_ai_provider_key(app);
            Ok(())
        }
        Err(error) => Err(format!(
            "저장된 Gemini API key를 삭제하지 못했습니다: {error}"
        )),
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

    let mut public_config = serde_json::to_value(config).map_err(|error| error.to_string())?;
    if let Some(object) = public_config.as_object_mut() {
        object.insert(
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

#[tauri::command]
pub(crate) fn get_ai_provider_status(app: tauri::AppHandle) -> Result<AiProviderStatus, String> {
    Ok(ai_provider_status(&app))
}

#[tauri::command]
pub(crate) fn save_ai_provider_config(
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
pub(crate) fn save_ai_provider_key(
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
pub(crate) fn clear_ai_provider_key(app: tauri::AppHandle) -> Result<AiProviderStatus, String> {
    clear_stored_ai_provider_key(&app)?;
    let mut config = load_ai_provider_config(&app);
    config.has_stored_key = false;
    save_ai_provider_config_to_settings(&app, &config)?;
    Ok(ai_provider_status(&app))
}

#[tauri::command]
pub(crate) fn generate_import_with_ai(
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
    let url =
        format!("https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent");
    let text = if input_text.trim().is_empty() {
        prompt
    } else {
        format!("{prompt}\n\n입력:\n{input_text}")
    };
    let parts = build_gemini_parts(&app, text, &image_filenames)?;
    let body = serde_json::json!({
        "contents": [{ "role": "user", "parts": parts }],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
        },
    });

    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|error| format!("Gemini HTTP client를 만들지 못했습니다: {error}"))?;
    let response = client
        .post(url)
        .header("x-goog-api-key", key)
        .json(&body)
        .send()
        .map_err(|error| format!("Gemini 호출에 실패했습니다: {error}"))?;
    let status = response.status();
    let value: serde_json::Value = response
        .json()
        .map_err(|error| format!("Gemini 응답 JSON을 읽지 못했습니다: {error}"))?;
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

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SimilarQuestionContextRequest {
    source_id: String,
    #[serde(default)]
    source_question_number: Option<String>,
    #[serde(default)]
    subject: Option<String>,
    #[serde(default)]
    unit: Option<String>,
    #[serde(default)]
    subunit: Option<String>,
    #[serde(default)]
    difficulty_score: Option<f64>,
    #[serde(default)]
    concepts: Vec<String>,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    keywords: Vec<String>,
    #[serde(default)]
    entry_title: Option<String>,
    #[serde(default)]
    entry_kind: Option<String>,
    #[serde(default)]
    source_type: Option<String>,
    #[serde(default)]
    formulae: Vec<String>,
    #[serde(default)]
    solution_methods: Vec<String>,
    #[serde(default)]
    passage_clues: Vec<String>,
    #[serde(default)]
    thinkers: Vec<String>,
    #[serde(default)]
    choice_criteria: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SimilarQuestionCandidateRequest {
    candidate_id: String,
    question_text: String,
    subject: String,
    #[serde(default)]
    unit: Option<String>,
    #[serde(default)]
    subunit: Option<String>,
    #[serde(default)]
    concepts: Vec<String>,
    #[serde(default)]
    difficulty_score: Option<f64>,
    #[serde(default)]
    importance_score: Option<f64>,
    #[serde(default)]
    quality_score: Option<f64>,
    has_explanation: bool,
    #[serde(default)]
    explanation: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SimilarQuestionRankingRequest {
    context: SimilarQuestionContextRequest,
    candidates: Vec<SimilarQuestionCandidateRequest>,
}

#[tauri::command]
pub(crate) fn rank_similar_questions_with_ai(
    app: tauri::AppHandle,
    request: SimilarQuestionRankingRequest,
) -> Result<String, String> {
    let config = load_ai_provider_config(&app);
    if !config.enabled || matches!(config.provider_type, AiProviderType::Manual) {
        return Err("AI provider가 비활성화되어 있습니다.".into());
    }
    if request.candidates.is_empty() || request.candidates.len() > 30 {
        return Err("유사 문제 후보는 1~30개여야 합니다.".into());
    }

    let key = ai_provider_key(&app, &config)?;
    let model = gemini_model(&config.provider_type);
    let context_json = serde_json::to_string(&request.context)
        .map_err(|error| format!("유사 문제 기준 정보를 직렬화하지 못했습니다: {error}"))?;
    let candidates_json = serde_json::to_string(&request.candidates)
        .map_err(|error| format!("유사 문제 후보를 직렬화하지 못했습니다: {error}"))?;
    let prompt = format!(
        "다음 context와 각 candidate를 개별적으로 비교해 유사도를 평가하세요. candidate끼리 비교하지 마세요. 새 문제나 새로운 candidateId를 생성하지 마세요. 제공된 candidateId만 사용해 JSON {{\"results\":[{{\"candidateId\":string,\"score\":0-100,\"reasons\":[string],\"sharedConcepts\":[string],\"differences\":[string]}}]}}만 반환하세요.\n\ncontext(JSON):\n{context_json}\n\ncandidates(JSON):\n{candidates_json}"
    );
    let body = serde_json::json!({
        "contents": [{ "role": "user", "parts": [{ "text": prompt }] }],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
        },
    });

    let response = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|error| format!("Gemini HTTP client를 만들지 못했습니다: {error}"))?
        .post(format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        ))
        .header("x-goog-api-key", key)
        .json(&body)
        .send()
        .map_err(|error| format!("Gemini 호출에 실패했습니다: {error}"))?;
    let status = response.status();
    let value: serde_json::Value = response
        .json()
        .map_err(|error| format!("Gemini 응답 JSON을 읽지 못했습니다: {error}"))?;
    if !status.is_success() {
        return Err("Gemini 유사 문제 재정렬에 실패했습니다.".into());
    }

    extract_gemini_text(value)
}
