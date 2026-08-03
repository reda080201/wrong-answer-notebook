use crate::images::{images_dir, validate_image_filename};
use crate::notebook_store::{collect_entry_image_filenames, NotebookStore};
use crate::unix_time_string;
use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IntegrityIssue {
    pub(crate) id: String,
    pub(crate) severity: String,
    pub(crate) message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) entry_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IntegrityReport {
    pub(crate) checked_at: String,
    pub(crate) issues: Vec<IntegrityIssue>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OrphanImagePreview {
    pub(crate) filenames: Vec<String>,
    pub(crate) total_bytes: u64,
}

#[tauri::command]
pub(crate) fn run_integrity_check(
    app: tauri::AppHandle,
    store: tauri::State<'_, Arc<NotebookStore>>,
) -> Result<IntegrityReport, String> {
    let entries = store.load_entries()?;
    let image_dir = images_dir(&app)?;
    let referenced = store.referenced_image_filenames()?;

    let mut issues = Vec::new();
    if image_dir.exists() {
        for item in fs::read_dir(&image_dir).map_err(|error| error.to_string())? {
            let path = item.map_err(|error| error.to_string())?.path();
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
        for filename in collect_entry_image_filenames(&entry) {
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
pub(crate) fn cleanup_orphan_images(
    app: tauri::AppHandle,
    store: tauri::State<'_, Arc<NotebookStore>>,
) -> Result<usize, String> {
    let referenced = store.referenced_image_filenames()?;
    let image_dir = images_dir(&app)?;
    let mut removed = 0;
    for item in fs::read_dir(image_dir).map_err(|error| error.to_string())? {
        let path = item.map_err(|error| error.to_string())?.path();
        let Some(filename) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if !referenced.contains(filename) && validate_image_filename(filename).is_ok() {
            fs::remove_file(path).map_err(|error| error.to_string())?;
            removed += 1;
        }
    }
    Ok(removed)
}

#[tauri::command]
pub(crate) fn preview_orphan_images(
    app: tauri::AppHandle,
    store: tauri::State<'_, Arc<NotebookStore>>,
) -> Result<OrphanImagePreview, String> {
    let referenced = store.referenced_image_filenames()?;
    let image_dir = images_dir(&app)?;
    let mut filenames = Vec::new();
    let mut total_bytes = 0u64;
    if image_dir.exists() {
        for item in fs::read_dir(image_dir).map_err(|error| error.to_string())? {
            let path = item.map_err(|error| error.to_string())?.path();
            let Some(filename) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if validate_image_filename(filename).is_err() || referenced.contains(filename) {
                continue;
            }
            total_bytes = total_bytes
                .checked_add(
                    fs::metadata(&path)
                        .map_err(|error| error.to_string())?
                        .len(),
                )
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
