use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use uuid::Uuid;

use crate::notebook_store::NotebookStore;
use crate::{app_dir, write_bytes_atomic};

pub(crate) const MAX_IMPORT_IMAGE_BYTES: u64 = 25 * 1024 * 1024;

pub(crate) fn images_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_dir(app)?.join("images");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub(crate) fn is_allowed_image_extension(ext: &str) -> bool {
    matches!(
        ext.to_ascii_lowercase().as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp"
    )
}

pub(crate) fn validate_image_filename(filename: &str) -> Result<(), String> {
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

pub(crate) fn image_path(app: &tauri::AppHandle, filename: &str) -> Result<PathBuf, String> {
    validate_image_filename(filename)?;
    Ok(images_dir(app)?.join(filename))
}

pub(crate) fn validate_image_header_bytes(bytes: &[u8], ext: &str) -> Result<(), String> {
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

pub(crate) fn validate_image_magic(path: &Path, ext: &str, max_bytes: u64) -> Result<(), String> {
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

pub(crate) fn compatible_image_extensions(left: &str, right: &str) -> bool {
    let left = left.to_ascii_lowercase();
    let right = right.to_ascii_lowercase();
    left == right || (left == "jpg" && right == "jpeg") || (left == "jpeg" && right == "jpg")
}

pub(crate) fn extension_from_magic(bytes: &[u8]) -> Option<&'static str> {
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

pub(crate) fn validate_import_filename_hint(filename: &str) -> Result<(), String> {
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

pub(crate) fn extension_for_image_mime(mime: &str) -> Option<&'static str> {
    match mime.trim().to_ascii_lowercase().as_str() {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpeg"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        _ => None,
    }
}

pub(crate) fn resolve_import_image_extension(
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

pub(crate) fn save_import_image_bytes_to_dir(
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

#[tauri::command]
pub(crate) fn save_import_image_bytes(
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
pub(crate) fn save_image(app: tauri::AppHandle, source_path: String) -> Result<String, String> {
    let ext = Path::new(&source_path)
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
pub(crate) fn get_image_file_path(
    app: tauri::AppHandle,
    filename: String,
) -> Result<String, String> {
    let path = image_path(&app, &filename)?;
    if !path.exists() {
        return Err("이미지를 찾을 수 없습니다.".into());
    }
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub(crate) fn delete_image(
    app: tauri::AppHandle,
    store: tauri::State<'_, Arc<NotebookStore>>,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn import_image_byte_limit_is_25mb() {
        assert_eq!(MAX_IMPORT_IMAGE_BYTES, 25 * 1024 * 1024);
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
}
