use crate::notebook_store::{with_shared_storage_lock, NotebookStore, StagedCommitResult};
use crate::{
    app_dir, images_dir, save_import_image_bytes_to_dir, validate_image_filename, WrongAnswerEntry,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, SystemTime};
use uuid::Uuid;

pub(crate) const IMPORT_ASSET_SESSION_MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60);
pub(crate) const MAX_IMPORT_PREVIEW_BYTES: u64 = 32 * 1024 * 1024;

fn reject_link(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
        return Err("미리보기 경로에 링크를 사용할 수 없습니다.".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err("미리보기 경로에 reparse point를 사용할 수 없습니다.".into());
        }
    }
    Ok(())
}

pub(crate) fn read_staged_preview(
    data_dir: &Path,
    session_id: &str,
    filename: &str,
) -> Result<Vec<u8>, String> {
    Uuid::parse_str(session_id)
        .map_err(|_| "가져오기 자산 session ID가 올바르지 않습니다.".to_string())?;
    validate_image_filename(filename)?;
    if filename.contains(':') {
        return Err("허용되지 않은 이미지 파일명입니다.".into());
    }
    let sessions = data_dir.join("import-workspaces");
    let root = sessions.join(session_id);
    let assets = root.join("assets");
    let path = assets.join(filename);
    for item in [&sessions, &root, &assets, &path] {
        reject_link(item)?;
    }
    let canonical_assets = assets.canonicalize().map_err(|error| error.to_string())?;
    let canonical_path = path.canonicalize().map_err(|error| error.to_string())?;
    if !canonical_path.starts_with(&canonical_assets) {
        return Err("미리보기 경로가 session을 벗어납니다.".into());
    }
    let file = fs::File::open(&canonical_path).map_err(|error| error.to_string())?;
    let metadata = file.metadata().map_err(|error| error.to_string())?;
    if !metadata.is_file() {
        return Err("미리보기 대상이 일반 파일이 아닙니다.".into());
    }
    if metadata.len() > MAX_IMPORT_PREVIEW_BYTES {
        return Err("미리보기 이미지가 너무 큽니다.".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_IMPORT_PREVIEW_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_IMPORT_PREVIEW_BYTES {
        return Err("미리보기 이미지가 너무 큽니다.".into());
    }
    let ext = Path::new(filename)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    crate::images::validate_decoded_image(&bytes, ext)?;
    Ok(bytes)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImportAssetStageResult {
    session_id: String,
    source_name: String,
    staged_filename: String,
    sha256: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImportAssetSessionAssetManifest {
    source_name: String,
    staged_filename: Option<String>,
    size: u64,
    sha256: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImportAssetSessionManifest {
    id: String,
    mode: String,
    assets: Vec<ImportAssetSessionAssetManifest>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImportAssetSessionValidationResult {
    valid: bool,
    missing_files: Vec<String>,
    mismatched_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImportAssetCommitResult {
    session_id: String,
    filenames: Vec<String>,
    revision: Option<String>,
    entries: Option<Vec<WrongAnswerEntry>>,
}

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub(crate) fn import_asset_session_root(
    app: &tauri::AppHandle,
    session_id: &str,
) -> Result<PathBuf, String> {
    Uuid::parse_str(session_id)
        .map_err(|_| "가져오기 자산 session ID가 올바르지 않습니다.".to_string())?;
    Ok(app_dir(app)?.join("import-workspaces").join(session_id))
}

#[tauri::command]
pub(crate) fn create_import_asset_session(app: tauri::AppHandle) -> Result<String, String> {
    let session_id = Uuid::new_v4().to_string();
    fs::create_dir_all(import_asset_session_root(&app, &session_id)?.join("assets"))
        .map_err(|error| error.to_string())?;
    Ok(session_id)
}

#[tauri::command]
pub(crate) fn stage_import_asset_bytes(
    app: tauri::AppHandle,
    session_id: String,
    source_name: String,
    bytes: Vec<u8>,
    mime: Option<String>,
) -> Result<ImportAssetStageResult, String> {
    let root = import_asset_session_root(&app, &session_id)?;
    let staged_filename = save_import_image_bytes_to_dir(
        &root.join("assets"),
        &bytes,
        Some(&source_name),
        mime.as_deref(),
    )?;
    Ok(ImportAssetStageResult {
        session_id,
        source_name,
        staged_filename,
        sha256: sha256_hex(&bytes),
    })
}

#[tauri::command]
pub(crate) fn validate_import_asset_session(
    app: tauri::AppHandle,
    manifest: ImportAssetSessionManifest,
) -> Result<ImportAssetSessionValidationResult, String> {
    if manifest.mode != "tauri-staged" {
        return Ok(ImportAssetSessionValidationResult {
            valid: true,
            missing_files: Vec::new(),
            mismatched_files: Vec::new(),
        });
    }

    let assets_dir = import_asset_session_root(&app, &manifest.id)?.join("assets");
    let mut missing_files = Vec::new();
    let mut mismatched_files = Vec::new();
    for asset in manifest.assets {
        let Some(staged_filename) = asset.staged_filename else {
            mismatched_files.push(asset.source_name);
            continue;
        };
        if validate_image_filename(&staged_filename).is_err() {
            mismatched_files.push(asset.source_name);
            continue;
        }
        let path = assets_dir.join(&staged_filename);
        if !path.is_file() {
            missing_files.push(asset.source_name);
            continue;
        }
        let bytes = fs::read(&path).map_err(|error| error.to_string())?;
        if bytes.len() as u64 != asset.size
            || asset
                .sha256
                .as_deref()
                .map(|hash| hash.to_ascii_lowercase())
                != Some(sha256_hex(&bytes))
        {
            mismatched_files.push(asset.source_name);
        }
    }

    Ok(ImportAssetSessionValidationResult {
        valid: missing_files.is_empty() && mismatched_files.is_empty(),
        missing_files,
        mismatched_files,
    })
}

#[tauri::command]
pub(crate) fn cleanup_stale_import_asset_sessions(
    app: tauri::AppHandle,
    protected_session_ids: Vec<String>,
) -> Result<usize, String> {
    let root = app_dir(&app)?.join("import-workspaces");
    if !root.exists() {
        return Ok(0);
    }
    let protected: HashSet<String> = protected_session_ids
        .into_iter()
        .filter(|id| Uuid::parse_str(id).is_ok())
        .collect();
    let now = SystemTime::now();
    let mut removed = 0;
    for item in fs::read_dir(root).map_err(|error| error.to_string())? {
        let path = item.map_err(|error| error.to_string())?.path();
        if !path.is_dir() {
            continue;
        }
        let Some(session_id) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if protected.contains(session_id) {
            continue;
        }
        let modified = fs::metadata(&path)
            .and_then(|metadata| metadata.modified())
            .unwrap_or(now);
        if now.duration_since(modified).unwrap_or_default() >= IMPORT_ASSET_SESSION_MAX_AGE {
            fs::remove_dir_all(path).map_err(|error| error.to_string())?;
            removed += 1;
        }
    }
    Ok(removed)
}

#[tauri::command]
pub(crate) fn commit_import_asset_session(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<ImportAssetCommitResult, String> {
    let root = import_asset_session_root(&app, &session_id)?;
    let assets_dir = root.join("assets");
    if !assets_dir.exists() {
        return Err("가져오기 자산 session을 찾을 수 없습니다.".into());
    }
    let data_root = app_dir(&app)?;
    with_shared_storage_lock(&data_root, || {
        let destination = images_dir(&app)?;
        let mut moved: Vec<(PathBuf, PathBuf)> = Vec::new();
        let result = (|| -> Result<(), String> {
            for item in fs::read_dir(&assets_dir).map_err(|error| error.to_string())? {
                let source = item.map_err(|error| error.to_string())?.path();
                if !source.is_file() {
                    continue;
                }
                let filename = source
                    .file_name()
                    .and_then(|name| name.to_str())
                    .ok_or_else(|| "staged 이미지 파일명을 읽지 못했습니다.".to_string())?
                    .to_string();
                validate_image_filename(&filename)?;
                let target = destination.join(&filename);
                if target.exists() {
                    return Err(format!("이미지 파일명이 이미 사용 중입니다: {filename}"));
                }
                fs::rename(&source, &target).map_err(|error| error.to_string())?;
                moved.push((source, target));
            }
            Ok(())
        })();
        if let Err(error) = result {
            for (source, target) in moved.iter().rev() {
                let _ = fs::rename(target, source);
            }
            return Err(error);
        }
        let filenames = moved
            .iter()
            .filter_map(|(_, target)| target.file_name()?.to_str().map(str::to_string))
            .collect();
        let _ = fs::remove_dir_all(&root);
        Ok(ImportAssetCommitResult {
            session_id,
            filenames,
            revision: None,
            entries: None,
        })
    })
}

#[tauri::command]
pub(crate) fn commit_import_asset_session_entry(
    app: tauri::AppHandle,
    store: tauri::State<'_, Arc<NotebookStore>>,
    session_id: String,
    entry_id: String,
    expected_updated_at: String,
    entry: WrongAnswerEntry,
) -> Result<ImportAssetCommitResult, String> {
    let root = import_asset_session_root(&app, &session_id)?;
    let committed: StagedCommitResult = store.commit_staged_entry_update(
        &root.join("assets"),
        &entry_id,
        &expected_updated_at,
        entry,
    )?;
    // Data and image promotion already succeeded; cleanup must not report a false failure.
    let _ = fs::remove_dir_all(&root);
    Ok(ImportAssetCommitResult {
        session_id,
        filenames: committed.filenames,
        revision: Some(committed.revision),
        entries: Some(committed.entries),
    })
}

#[tauri::command]
pub(crate) fn commit_import_asset_session_entries(
    app: tauri::AppHandle,
    store: tauri::State<'_, Arc<NotebookStore>>,
    session_id: String,
    entries: Vec<WrongAnswerEntry>,
) -> Result<ImportAssetCommitResult, String> {
    let root = import_asset_session_root(&app, &session_id)?;
    let committed = store.commit_staged_entries_add(&root.join("assets"), entries)?;
    // Both image promotion and entries persistence succeeded. Cleanup is best effort.
    let _ = fs::remove_dir_all(&root);
    Ok(ImportAssetCommitResult {
        session_id,
        filenames: committed.filenames,
        revision: Some(committed.revision),
        entries: Some(committed.entries),
    })
}

#[tauri::command]
pub(crate) fn discard_import_asset_session(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<(), String> {
    let root = import_asset_session_root(&app, &session_id)?;
    if root.exists() {
        fs::remove_dir_all(root).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn read_import_asset_preview(
    app: tauri::AppHandle,
    session_id: String,
    filename: String,
) -> Result<String, String> {
    let bytes = read_staged_preview(&app_dir(&app)?, &session_id, &filename)?;
    Ok(STANDARD.encode(bytes))
}

#[cfg(test)]
mod preview_tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, String, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let id = Uuid::new_v4().to_string();
        let assets = dir
            .path()
            .join("import-workspaces")
            .join(&id)
            .join("assets");
        fs::create_dir_all(&assets).unwrap();
        (dir, id, assets)
    }
    #[test]
    fn rejects_unsafe_missing_and_non_images() {
        let (dir, id, assets) = fixture();
        for name in ["../a.png", "folder/a.png", "a.json", "C:a.png"] {
            assert!(read_staged_preview(dir.path(), &id, name).is_err());
        }
        assert!(read_staged_preview(dir.path(), "../invalid", "a.png").is_err());
        assert!(read_staged_preview(dir.path(), &id, "missing.png").is_err());
        fs::write(assets.join("fake.png"), b"not an image").unwrap();
        assert!(read_staged_preview(dir.path(), &id, "fake.png").is_err());
        fs::write(assets.join("header.png"), [137, 80, 78, 71, 13, 10, 26, 10]).unwrap();
        assert!(read_staged_preview(dir.path(), &id, "header.png").is_err());
    }
    #[test]
    fn reads_real_png_and_rejects_oversized_file() {
        let (dir, id, assets) = fixture();
        image::RgbaImage::new(1, 1)
            .save(assets.join("ok.png"))
            .unwrap();
        assert!(!read_staged_preview(dir.path(), &id, "ok.png")
            .unwrap()
            .is_empty());
        fs::File::create(assets.join("big.png"))
            .unwrap()
            .set_len(MAX_IMPORT_PREVIEW_BYTES + 1)
            .unwrap();
        assert!(read_staged_preview(dir.path(), &id, "big.png")
            .unwrap_err()
            .contains("너무 큽니다"));
    }
    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        let (dir, id, assets) = fixture();
        std::os::unix::fs::symlink(dir.path().join("outside.png"), assets.join("escape.png"))
            .unwrap();
        assert!(read_staged_preview(dir.path(), &id, "escape.png").is_err());
    }
    #[cfg(windows)]
    #[test]
    fn rejects_directory_junction_escape() {
        let (dir, id, assets) = fixture();
        let outside = dir.path().join("outside");
        fs::create_dir(&outside).unwrap();
        image::RgbaImage::new(1, 1)
            .save(outside.join("escape.png"))
            .unwrap();
        fs::remove_dir(&assets).unwrap();
        let output = std::process::Command::new("cmd")
            .args(["/c", "mklink", "/J"])
            .arg(&assets)
            .arg(&outside)
            .output()
            .unwrap();
        assert!(output.status.success(), "junction fixture creation failed");
        assert!(read_staged_preview(dir.path(), &id, "escape.png").is_err());
    }
}
