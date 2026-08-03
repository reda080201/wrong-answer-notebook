use serde_json::json;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    time::Duration,
};

const MAX_AUDIT_FILE_BYTES: u64 = 1_000_000;

pub(super) fn write(
    audit_path: &Path,
    tool: &str,
    duration: Duration,
    success: bool,
    result_count: usize,
    error_code: Option<i32>,
) {
    if let Some(parent) = audit_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if audit_path
        .metadata()
        .map(|meta| meta.len() > MAX_AUDIT_FILE_BYTES)
        .unwrap_or(false)
    {
        let _ = fs::rename(audit_path, audit_path.with_extension("jsonl.1"));
    }
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(audit_path)
    {
        let _ = writeln!(
            file,
            "{}",
            json!({
                "time": super::now_string(),
                "tool": tool,
                "durationMs": duration.as_millis() as u64,
                "success": success,
                "resultCount": result_count,
                "errorCode": error_code,
            })
        );
    }
}
