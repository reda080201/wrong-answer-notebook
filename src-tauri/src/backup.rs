use crate::images::{
    images_dir, validate_image_filename, validate_image_header_bytes, validate_image_magic,
    MAX_IMPORT_IMAGE_BYTES,
};
use crate::notebook_store::NotebookStore;
use crate::storage::{app_dir, data_file, settings_file, write_bytes_atomic, write_json_atomic};
use crate::WrongAnswerEntry;
use serde::Serialize;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use uuid::Uuid;
use zip::write::FileOptions;

pub(crate) const MAX_BACKUP_ZIP_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_BACKUP_JSON_BYTES: u64 = 100 * 1024 * 1024;
const MAX_BACKUP_TOTAL_IMAGE_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_BACKUP_ENTRY_COUNT: usize = 10_000;
const ENTRIES_SCHEMA_VERSION: u32 = 2;
const CURRENT_DATA_SCHEMA_VERSION: u32 = 1;
pub(crate) const PERSISTENT_DATA_FILES: &[&str] = &[
    "entries.json",
    "settings.json",
    "exam-sessions.json",
    "generated-exams.json",
    "data-schema.json",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RestoreBackupResult {
    restored: bool,
    warnings: Vec<String>,
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

fn unix_time_string() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".into())
}

fn build_backup_meta(included_files: &[String]) -> serde_json::Value {
    serde_json::json!({
        "backupFormat": 2,
        "appVersion": env!("CARGO_PKG_VERSION"),
        "dataSchemaVersion": CURRENT_DATA_SCHEMA_VERSION,
        "createdAt": unix_time_string(),
        "source": "tauri",
        "includedFiles": included_files,
        "includesImages": included_files.iter().any(|name| name.starts_with("images/")),
        "includesImportWorkspaces": included_files.iter().any(|name| name.starts_with("import-workspaces/")),
    })
}

fn parse_entries_value(value: serde_json::Value) -> Result<Vec<WrongAnswerEntry>, String> {
    if value.is_array() {
        return serde_json::from_value(value).map_err(|e| e.to_string());
    }
    let version = value
        .get("schemaVersion")
        .and_then(serde_json::Value::as_u64)
        .ok_or_else(|| "저장 데이터 schemaVersion을 확인할 수 없습니다.".to_string())?;
    if version != ENTRIES_SCHEMA_VERSION as u64 {
        return Err(format!(
            "지원하지 않는 저장 데이터 schemaVersion입니다: {version}"
        ));
    }
    let entries = value
        .get("entries")
        .cloned()
        .ok_or_else(|| "저장 데이터 entries를 확인할 수 없습니다.".to_string())?;
    serde_json::from_value(entries).map_err(|e| e.to_string())
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
pub(crate) fn create_backup_zip(app: tauri::AppHandle, backup_path: String) -> Result<(), String> {
    create_backup_zip_at(&app, Path::new(&backup_path))
}

pub(crate) fn create_backup_zip_at(
    app: &tauri::AppHandle,
    backup_path: &Path,
) -> Result<(), String> {
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

    let parent = backup_path
        .parent()
        .ok_or_else(|| "백업 경로를 확인할 수 없습니다.".to_string())?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temp_file = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    let temp_path = temp_file.path().to_path_buf();
    let file = temp_file.reopen().map_err(|e| e.to_string())?;
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

    let mut included_files = vec![
        "entries.json".to_string(),
        "settings.json".to_string(),
        "backup-meta.json".to_string(),
    ];
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
        included_files.push(filename.to_string());
    }

    let workspace_root = app_dir(app)?.join("import-workspaces");
    let mut workspace_files = Vec::new();
    collect_workspace_files(&workspace_root, &workspace_root, &mut workspace_files)?;
    for (archive_name, path) in &workspace_files {
        let size = fs::metadata(&path).map_err(|e| e.to_string())?.len();
        if size > MAX_BACKUP_JSON_BYTES {
            return Err(format!(
                "{archive_name} 파일이 백업 허용 용량을 초과했습니다."
            ));
        }
        zip.start_file(archive_name, options)
            .map_err(|e| e.to_string())?;
        let mut source = fs::File::open(path).map_err(|e| e.to_string())?;
        std::io::copy(&mut source, &mut zip).map_err(|e| e.to_string())?;
        included_files.push(archive_name.clone());
    }

    for (filename, _, _) in &images {
        included_files.push(format!("images/{filename}"));
    }

    let meta = build_backup_meta(&included_files);
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
    temp_file
        .persist(backup_path)
        .map_err(|error| error.error.to_string())?;
    Ok(())
}

#[tauri::command]
pub(crate) fn create_auto_backup(app: tauri::AppHandle) -> Result<String, String> {
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
pub(crate) fn create_pre_update_backup(
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

fn validate_optional_store_json(name: &str, bytes: &[u8]) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_slice(bytes)
        .map_err(|error| format!("백업의 {name} JSON이 올바르지 않습니다: {error}"))?;
    match name {
        "exam-sessions.json" | "generated-exams.json" if !value.is_array() => Err(format!(
            "백업의 {name} 형식이 올바르지 않습니다. 배열이어야 합니다."
        )),
        "data-schema.json" => {
            if value
                .get("schemaVersion")
                .and_then(serde_json::Value::as_u64)
                != Some(CURRENT_DATA_SCHEMA_VERSION as u64)
            {
                return Err("백업의 데이터 스키마 버전이 지원되지 않습니다.".into());
            }
            Ok(())
        }
        _ => Ok(()),
    }
}

fn rollback_restore_paths_with_targets(
    moved: &[(PathBuf, PathBuf)],
    managed_targets: &[PathBuf],
) -> Result<(), String> {
    for target in managed_targets.iter().rev() {
        remove_restore_path(target)?;
    }
    for (original, backup) in moved.iter().rev() {
        if backup.exists() {
            if let Some(parent) = original.parent() {
                fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            fs::rename(backup, original).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn restore_backup_zip(
    app: tauri::AppHandle,
    store: tauri::State<'_, Arc<NotebookStore>>,
    backup_path: String,
) -> Result<RestoreBackupResult, String> {
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
            validate_optional_store_json(&name, &bytes)?;
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
    let managed_targets = [
        data_file(&app)?,
        settings_file(&app)?,
        app_dir.join("exam-sessions.json"),
        app_dir.join("generated-exams.json"),
        app_dir.join("data-schema.json"),
        image_dir.clone(),
        app_dir.join("import-workspaces"),
    ];
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
        move_target(settings_file(&app)?, "settings.json")?;
        for name in PERSISTENT_DATA_FILES
            .iter()
            .copied()
            .filter(|name| *name != "entries.json" && *name != "settings.json")
        {
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
        let rollback_error = rollback_restore_paths_with_targets(&moved, &managed_targets).err();
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
        let rollback_error = rollback_restore_paths_with_targets(&moved, &managed_targets).err();
        let _ = fs::remove_dir_all(&rollback_dir);
        return Err(match rollback_error {
            Some(rollback) => format!("{error} 복원 rollback 실패: {rollback}"),
            None => error,
        });
    }
    // Data has already been restored successfully. Cleanup failure must not
    // report a false restore failure or trigger a second restore attempt.
    let mut warnings = Vec::new();
    if let Err(error) = fs::remove_dir_all(&rollback_dir) {
        warnings.push(format!("복원 임시 디렉터리를 정리하지 못했습니다: {error}"));
    }
    Ok(RestoreBackupResult {
        restored: true,
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        build_backup_meta, rollback_restore_paths_with_targets, validate_optional_store_json,
    };

    #[test]
    fn validates_optional_json_store_shapes() {
        assert!(validate_optional_store_json("exam-sessions.json", br#"[]"#).is_ok());
        assert!(validate_optional_store_json("generated-exams.json", br#"[]"#).is_ok());
        assert!(validate_optional_store_json("exam-sessions.json", br#"{}"#).is_err());
        assert!(validate_optional_store_json("generated-exams.json", b"{").is_err());
        assert!(
            validate_optional_store_json("data-schema.json", br#"{"schemaVersion":1}"#).is_ok()
        );
        assert!(
            validate_optional_store_json("data-schema.json", br#"{"schemaVersion":2}"#).is_err()
        );
    }

    #[test]
    fn rollback_removes_targets_created_by_failed_restore() {
        let directory = tempfile::tempdir().expect("temp directory");
        let entries = directory.path().join("entries.json");
        let rollback = directory.path().join("rollback-entries.json");
        let generated = directory.path().join("generated-exams.json");
        let images = directory.path().join("images");
        std::fs::write(&rollback, b"before").expect("seed rollback file");
        std::fs::write(&entries, b"restored").expect("seed restored file");
        std::fs::write(&generated, b"[]").expect("seed new optional store");
        std::fs::create_dir_all(&images).expect("create images");
        std::fs::write(images.join("new.png"), b"image").expect("seed image");

        rollback_restore_paths_with_targets(
            &[(entries.clone(), rollback)],
            &[entries.clone(), generated.clone(), images.clone()],
        )
        .expect("rollback");

        assert_eq!(
            std::fs::read(&entries).expect("restored original"),
            b"before"
        );
        assert!(!generated.exists());
        assert!(!images.exists());
    }

    #[test]
    fn backup_meta_matches_planned_archive_entries() {
        let files = vec![
            "entries.json".to_string(),
            "settings.json".to_string(),
            "images/diagram.png".to_string(),
            "import-workspaces/session/workspace.json".to_string(),
            "backup-meta.json".to_string(),
        ];
        let meta = build_backup_meta(&files);
        assert_eq!(
            meta.get("includedFiles")
                .and_then(serde_json::Value::as_array)
                .map(Vec::len),
            Some(files.len())
        );
        assert_eq!(
            meta.get("includesImages")
                .and_then(serde_json::Value::as_bool),
            Some(true)
        );
        assert_eq!(
            meta.get("includesImportWorkspaces")
                .and_then(serde_json::Value::as_bool),
            Some(true)
        );
    }
}
