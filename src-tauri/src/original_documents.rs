use crate::{app_dir, storage::write_bytes_atomic};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs,
    io::Read,
    path::{Path, PathBuf},
};

pub(crate) const MAX_ORIGINAL_BYTES: usize = 100 * 1024 * 1024;
pub(crate) const MAX_ENCODED_BYTES: usize = MAX_ORIGINAL_BYTES.div_ceil(3) * 4;
pub(crate) const ORIGINALS: &str = "original-documents-v1";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OriginalDocument {
    pub(crate) version: u32,
    pub(crate) original_asset_id: String,
    pub(crate) sha256: String,
    pub(crate) mime: String,
    pub(crate) byte_length: usize,
    filename: String,
    source_key: String,
    page_count: usize,
    pages: Vec<OriginalPage>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OriginalPage {
    physical_page: usize,
    source_page_image: String,
}

fn is_link(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    metadata.file_type().is_symlink()
}

fn check_id(id: &str) -> Result<(), String> {
    if id.len() != 64
        || !id
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err("원본 문서 식별자가 올바르지 않습니다.".into());
    }
    Ok(())
}

fn asset_path(root: &Path, id: &str) -> Result<PathBuf, String> {
    check_id(id)?;
    let directory = root.join(ORIGINALS);
    match fs::symlink_metadata(&directory) {
        Ok(metadata) => {
            if !metadata.is_dir()
                || is_link(&metadata)
                || directory
                    .canonicalize()
                    .map_err(|e| e.to_string())?
                    .parent()
                    != Some(root.canonicalize().map_err(|e| e.to_string())?.as_path())
            {
                return Err("원본 문서 저장 경로를 확인할 수 없습니다.".into());
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }
    let path = directory.join(id);
    match fs::symlink_metadata(&path) {
        Ok(metadata) => {
            if !metadata.is_file()
                || is_link(&metadata)
                || path.canonicalize().map_err(|e| e.to_string())?.parent()
                    != Some(
                        directory
                            .canonicalize()
                            .map_err(|e| e.to_string())?
                            .as_path(),
                    )
            {
                return Err("원본 문서 파일 경로를 확인할 수 없습니다.".into());
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }
    Ok(path)
}

fn mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"%PDF-") {
        Some("application/pdf")
    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        Some("image/webp")
    } else {
        None
    }
}

pub(crate) fn check_bytes(id: &str, bytes: &[u8]) -> Result<(), String> {
    check_id(id)?;
    if bytes.len() > MAX_ORIGINAL_BYTES
        || mime(bytes).is_none()
        || format!("{:x}", Sha256::digest(bytes)) != id
    {
        return Err("원본 문서 형식·크기·SHA-256을 확인하지 못했습니다.".into());
    }
    Ok(())
}

pub(crate) fn check_link(doc: &OriginalDocument, bytes: &[u8]) -> Result<(), String> {
    let mut pages = HashSet::new();
    if doc.version != 1
        || doc.filename.trim().is_empty()
        || doc.filename.encode_utf16().count() > 255
        || doc
            .filename
            .chars()
            .any(|c| c == '/' || c == '\\' || c < ' ')
        || doc.source_key.trim().is_empty()
        || doc.page_count == 0
        || doc.pages.iter().any(|page| {
            page.physical_page == 0
                || page.physical_page > doc.page_count
                || page.source_page_image.is_empty()
                || !pages.insert(page.physical_page)
        })
        || doc.sha256 != doc.original_asset_id
        || doc.byte_length != bytes.len()
        || mime(bytes) != Some(doc.mime.as_str())
    {
        return Err("원본 문서 참조와 파일 메타데이터가 일치하지 않습니다.".into());
    }
    check_bytes(&doc.original_asset_id, bytes)
}

pub(crate) fn collect_links(
    value: &Value,
    output: &mut Vec<OriginalDocument>,
) -> Result<(), String> {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_links(item, output)?;
            }
        }
        Value::Object(fields) => {
            for (key, child) in fields {
                if key == "originalDocuments" {
                    let docs: Vec<OriginalDocument> =
                        serde_json::from_value(child.clone()).map_err(|e| e.to_string())?;
                    output.extend(docs);
                } else {
                    collect_links(child, output)?;
                }
            }
        }
        _ => {}
    }
    Ok(())
}

pub(crate) fn read(root: &Path, id: &str) -> Result<Vec<u8>, String> {
    let file = fs::File::open(asset_path(root, id)?).map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    file.take(MAX_ORIGINAL_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    check_bytes(id, &bytes)?;
    Ok(bytes)
}

pub(crate) fn put(root: &Path, id: &str, bytes: &[u8]) -> Result<(), String> {
    check_bytes(id, bytes)?;
    let path = asset_path(root, id)?;
    if path.exists() {
        if read(root, id)? != bytes {
            return Err("원본 문서의 동일 해시 충돌을 확인했습니다.".into());
        }
        return Ok(());
    }
    write_bytes_atomic(&path, bytes)
}

pub(crate) fn decode(encoded: &str) -> Result<Vec<u8>, String> {
    if encoded.len() > MAX_ENCODED_BYTES {
        return Err("원본 문서 크기 제한을 초과했습니다.".into());
    }
    STANDARD.decode(encoded).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn store_original_document(
    app: tauri::AppHandle,
    id: String,
    bytes_base64: String,
) -> Result<(), String> {
    put(&app_dir(&app)?, &id, &decode(&bytes_base64)?)
}

#[tauri::command]
pub(crate) fn read_original_document(app: tauri::AppHandle, id: String) -> Result<String, String> {
    Ok(STANDARD.encode(read(&app_dir(&app)?, &id)?))
}
