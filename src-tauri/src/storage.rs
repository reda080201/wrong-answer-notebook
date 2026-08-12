use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use tauri::Manager;

pub(crate) const CURRENT_DATA_SCHEMA_VERSION: u32 = 1;

pub(crate) fn app_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub(crate) fn data_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join("entries.json"))
}

pub(crate) fn settings_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join("settings.json"))
}

pub(crate) fn data_schema_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join("data-schema.json"))
}

pub(crate) fn load_entries_raw(app: &tauri::AppHandle) -> Result<String, String> {
    let path = data_file(app)?;
    if path.exists() {
        fs::read_to_string(path).map_err(|error| error.to_string())
    } else {
        Ok("[]".into())
    }
}

pub(crate) fn load_settings_raw(app: &tauri::AppHandle) -> Result<String, String> {
    let path = settings_file(app)?;
    if path.exists() {
        fs::read_to_string(path).map_err(|error| error.to_string())
    } else {
        Ok(r#"{"templates":[],"autoBackup":{"enabled":false}}"#.into())
    }
}

pub(crate) fn unix_time_string() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".into())
}

pub(crate) fn write_json_atomic(path: &Path, value: &serde_json::Value) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    write_bytes_atomic(path, &json)
}

pub(crate) fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let dir = path
        .parent()
        .ok_or_else(|| "저장 경로를 확인할 수 없습니다.".to_string())?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let mut tmp = tempfile::NamedTempFile::new_in(dir).map_err(|e| e.to_string())?;
    tmp.write_all(bytes).map_err(|e| e.to_string())?;
    tmp.flush().map_err(|e| e.to_string())?;
    tmp.as_file().sync_all().map_err(|e| e.to_string())?;
    tmp.persist(path).map_err(|e| e.error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{write_bytes_atomic, write_json_atomic};

    #[test]
    fn atomic_writers_replace_existing_files() {
        let dir = tempfile::tempdir().expect("temp dir");
        let bytes_path = dir.path().join("bytes.bin");
        std::fs::write(&bytes_path, b"old").expect("seed bytes");

        write_bytes_atomic(&bytes_path, b"new").expect("write bytes");
        assert_eq!(std::fs::read(&bytes_path).expect("read bytes"), b"new");

        let json_path = dir.path().join("value.json");
        write_json_atomic(&json_path, &serde_json::json!({ "value": 1 })).expect("write json");
        let value: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&json_path).expect("read json"))
                .expect("parse json");
        assert_eq!(value, serde_json::json!({ "value": 1 }));
    }

    #[test]
    fn atomic_writer_requires_a_parent_directory() {
        let error = write_bytes_atomic(Path::new(""), b"value").expect_err("missing parent");
        assert_eq!(error, "저장 경로를 확인할 수 없습니다.");
    }

    use std::path::Path;
}
