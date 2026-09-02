use crate::{
    notebook_store::{self, NotebookStore, ENTRIES_SCHEMA_VERSION},
    write_bytes_atomic, write_json_atomic, WrongAnswerEntry,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;
use uuid::Uuid;

pub const EXAM_SUBMISSION_JOURNAL_FILE: &str = "exam-submission-journal.json";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExamSubmissionTransactionInput {
    pub submitted_session: Value,
    #[serde(default)]
    pub derived_entries: Vec<WrongAnswerEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExamSubmissionTransactionResult {
    pub entries: Vec<WrongAnswerEntry>,
    pub sessions: Value,
    pub added_entry_ids: Vec<String>,
    pub revision: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DocumentSnapshot {
    exists: bool,
    sha256: String,
    bytes_base64: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum JournalPhase {
    Prepared,
    EntriesWritten,
    SessionsWritten,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExamSubmissionJournal {
    journal_version: u32,
    transaction_id: String,
    phase: JournalPhase,
    before_entries: DocumentSnapshot,
    after_entries: DocumentSnapshot,
    before_sessions: DocumentSnapshot,
    after_sessions: DocumentSnapshot,
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn snapshot_from_bytes(bytes: Option<Vec<u8>>) -> DocumentSnapshot {
    match bytes {
        Some(bytes) => DocumentSnapshot {
            exists: true,
            sha256: sha256(&bytes),
            bytes_base64: Some(STANDARD.encode(bytes)),
        },
        None => DocumentSnapshot {
            exists: false,
            sha256: sha256(&[]),
            bytes_base64: None,
        },
    }
}

fn read_snapshot(path: &Path) -> Result<DocumentSnapshot, String> {
    if path.exists() {
        Ok(snapshot_from_bytes(Some(
            fs::read(path).map_err(|error| error.to_string())?,
        )))
    } else {
        Ok(snapshot_from_bytes(None))
    }
}

fn snapshot_matches(path: &Path, expected: &DocumentSnapshot) -> Result<bool, String> {
    let actual = read_snapshot(path)?;
    Ok(actual.exists == expected.exists && actual.sha256 == expected.sha256)
}

fn snapshot_bytes(snapshot: &DocumentSnapshot) -> Result<Option<Vec<u8>>, String> {
    match (&snapshot.bytes_base64, snapshot.exists) {
        (Some(encoded), true) => STANDARD
            .decode(encoded)
            .map(Some)
            .map_err(|error| format!("시험 제출 journal bytes를 해석하지 못했습니다: {error}")),
        (None, false) => Ok(None),
        _ => Err("시험 제출 journal 문서 snapshot이 올바르지 않습니다.".into()),
    }
}

fn restore_snapshot(path: &Path, snapshot: &DocumentSnapshot) -> Result<(), String> {
    match snapshot_bytes(snapshot)? {
        Some(bytes) => write_bytes_atomic(path, &bytes),
        None if path.exists() => fs::remove_file(path).map_err(|error| error.to_string()),
        None => Ok(()),
    }
}

fn validate_entries_snapshot(snapshot: &DocumentSnapshot) -> Result<(), String> {
    if let Some(bytes) = snapshot_bytes(snapshot)? {
        let value: Value = serde_json::from_slice(&bytes).map_err(|error| {
            format!("시험 제출 entries snapshot JSON이 올바르지 않습니다: {error}")
        })?;
        notebook_store::parse_entries_value(value)?;
    }
    Ok(())
}

pub(crate) fn validate_sessions_value(value: &Value) -> Result<(), String> {
    let sessions = value.as_array().ok_or_else(|| {
        "모의고사 세션 저장 형식이 올바르지 않습니다. 배열이어야 합니다.".to_string()
    })?;
    for session in sessions {
        let object = session
            .as_object()
            .ok_or_else(|| "모의고사 세션 항목이 객체가 아닙니다.".to_string())?;
        for key in ["id", "status", "startedAt", "updatedAt"] {
            if object
                .get(key)
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .is_none()
            {
                return Err(format!("모의고사 세션의 {key} 값이 올바르지 않습니다."));
            }
        }
        if !object.get("questions").is_some_and(Value::is_array)
            || !object.get("responses").is_some_and(Value::is_array)
        {
            return Err("모의고사 세션의 questions와 responses는 배열이어야 합니다.".into());
        }
    }
    Ok(())
}

fn validate_sessions_snapshot(snapshot: &DocumentSnapshot) -> Result<(), String> {
    let value = match snapshot_bytes(snapshot)? {
        Some(bytes) => serde_json::from_slice(&bytes).map_err(|error| {
            format!("시험 제출 sessions snapshot JSON이 올바르지 않습니다: {error}")
        })?,
        None => Value::Array(Vec::new()),
    };
    validate_sessions_value(&value)
}

fn read_sessions_value(path: &Path) -> Result<Value, String> {
    let snapshot = read_snapshot(path)?;
    validate_sessions_snapshot(&snapshot)?;
    match snapshot_bytes(&snapshot)? {
        Some(bytes) => serde_json::from_slice(&bytes).map_err(|error| error.to_string()),
        None => Ok(Value::Array(Vec::new())),
    }
}

fn normalize_question_number(value: Option<&Value>) -> String {
    let raw = value.and_then(Value::as_str).unwrap_or_default().trim();
    let trimmed = raw
        .trim_start_matches("문항")
        .trim()
        .trim_end_matches('번')
        .trim();
    let normalized = trimmed.trim_start_matches('0');
    if normalized.is_empty() && trimmed.chars().all(|character| character == '0') {
        "0".into()
    } else {
        normalized.to_owned()
    }
}

fn entry_provenance_key(entry: &WrongAnswerEntry) -> Option<String> {
    let session_id = entry
        .extra
        .get("generatedFromExamSessionId")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    let number = normalize_question_number(entry.extra.get("generatedFromQuestionNumber"));
    (!number.is_empty()).then(|| format!("{session_id}:{number}"))
}

fn validate_submitted_session(session: &Value) -> Result<&str, String> {
    let object = session
        .as_object()
        .ok_or_else(|| "제출할 모의고사 세션이 객체가 아닙니다.".to_string())?;
    let id = object
        .get("id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "제출할 모의고사 세션 ID가 없습니다.".to_string())?;
    if object.get("status").and_then(Value::as_str) != Some("submitted") {
        return Err("제출 transaction에는 submitted 상태의 세션만 저장할 수 있습니다.".into());
    }
    for key in ["questions", "responses"] {
        if !object.get(key).is_some_and(Value::is_array) {
            return Err(format!("제출할 모의고사 세션의 {key}는 배열이어야 합니다."));
        }
    }
    for key in ["startedAt", "updatedAt", "submittedAt"] {
        if object
            .get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_none()
        {
            return Err(format!(
                "제출할 모의고사 세션의 {key} 값이 올바르지 않습니다."
            ));
        }
    }
    Ok(id)
}

fn entries_document_bytes(entries: &[WrongAnswerEntry]) -> Result<Vec<u8>, String> {
    serde_json::to_vec_pretty(&serde_json::json!({
        "schemaVersion": ENTRIES_SCHEMA_VERSION,
        "entries": entries,
    }))
    .map_err(|error| error.to_string())
}

fn sessions_document_bytes(sessions: &Value) -> Result<Vec<u8>, String> {
    serde_json::to_vec_pretty(sessions).map_err(|error| error.to_string())
}

fn write_journal(path: &Path, journal: &ExamSubmissionJournal) -> Result<(), String> {
    write_json_atomic(
        path,
        &serde_json::to_value(journal).map_err(|error| error.to_string())?,
    )
}

fn read_journal(path: &Path) -> Result<ExamSubmissionJournal, String> {
    let journal: ExamSubmissionJournal =
        serde_json::from_slice(&fs::read(path).map_err(|error| error.to_string())?)
            .map_err(|error| format!("시험 제출 복구 journal을 읽지 못했습니다: {error}"))?;
    if journal.journal_version != 1 {
        return Err("지원하지 않는 시험 제출 복구 journal 버전입니다.".into());
    }
    validate_entries_snapshot(&journal.before_entries)?;
    validate_entries_snapshot(&journal.after_entries)?;
    validate_sessions_snapshot(&journal.before_sessions)?;
    validate_sessions_snapshot(&journal.after_sessions)?;
    Ok(journal)
}

fn verify_after(
    entries_path: &Path,
    sessions_path: &Path,
    journal: &ExamSubmissionJournal,
) -> Result<(), String> {
    if snapshot_matches(entries_path, &journal.after_entries)?
        && snapshot_matches(sessions_path, &journal.after_sessions)?
    {
        Ok(())
    } else {
        Err("시험 제출 저장 결과를 검증하지 못했습니다.".into())
    }
}

fn reconcile_locked(
    store: &NotebookStore,
    sessions_path: &Path,
    journal_path: &Path,
) -> Result<(), String> {
    if !journal_path.exists() {
        return Ok(());
    }
    let mut journal = read_journal(journal_path)?;
    let entries_before = snapshot_matches(store.entries_path(), &journal.before_entries)?;
    let entries_after = snapshot_matches(store.entries_path(), &journal.after_entries)?;
    let sessions_before = snapshot_matches(sessions_path, &journal.before_sessions)?;
    let sessions_after = snapshot_matches(sessions_path, &journal.after_sessions)?;

    if entries_before && sessions_before {
        return fs::remove_file(journal_path).map_err(|error| error.to_string());
    }
    if entries_after && sessions_after {
        return fs::remove_file(journal_path).map_err(|error| error.to_string());
    }
    if (entries_before && sessions_after) || (entries_after && sessions_before) {
        restore_snapshot(store.entries_path(), &journal.after_entries)?;
        journal.phase = JournalPhase::EntriesWritten;
        write_journal(journal_path, &journal)?;
        restore_snapshot(sessions_path, &journal.after_sessions)?;
        journal.phase = JournalPhase::SessionsWritten;
        write_journal(journal_path, &journal)?;
        verify_after(store.entries_path(), sessions_path, &journal)?;
        return fs::remove_file(journal_path).map_err(|error| error.to_string());
    }
    Err("시험 제출 복구 상태를 판정하지 못했습니다. journal을 보존하고 저장을 차단합니다.".into())
}

pub fn reconcile_exam_submission(
    store: &NotebookStore,
    sessions_path: &Path,
    journal_path: &Path,
) -> Result<(), String> {
    store.with_write_lock(|| reconcile_locked(store, sessions_path, journal_path))
}

pub fn ensure_no_pending_exam_submission_journal(journal_path: &Path) -> Result<(), String> {
    if journal_path.exists() {
        return Err(
            "완료되지 않은 시험 제출 복구가 있어 백업을 시작할 수 없습니다. 앱 데이터를 다시 불러온 뒤 재시도하세요."
                .into(),
        );
    }
    Ok(())
}

pub fn submit_exam_transaction(
    store: &NotebookStore,
    sessions_path: &Path,
    journal_path: &Path,
    input: ExamSubmissionTransactionInput,
) -> Result<ExamSubmissionTransactionResult, String> {
    store.with_write_lock(|| {
        reconcile_locked(store, sessions_path, journal_path)?;
        let submitted_id = validate_submitted_session(&input.submitted_session)?.to_owned();
        let before_entries = read_snapshot(store.entries_path())?;
        let before_sessions = read_snapshot(sessions_path)?;
        validate_entries_snapshot(&before_entries)?;
        validate_sessions_snapshot(&before_sessions)?;

        let mut entries = store.load_entries()?;
        let mut known_keys: std::collections::HashSet<String> =
            entries.iter().filter_map(entry_provenance_key).collect();
        let mut added_entry_ids = Vec::new();
        for entry in input.derived_entries {
            if let Some(key) = entry_provenance_key(&entry) {
                if !known_keys.insert(key) {
                    continue;
                }
            }
            added_entry_ids.push(entry.id.clone());
            entries.insert(0, entry);
        }

        let mut sessions = read_sessions_value(sessions_path)?;
        let items = sessions.as_array_mut().expect("validated array");
        items.retain(|item| item.get("id").and_then(Value::as_str) != Some(submitted_id.as_str()));
        items.push(input.submitted_session);
        validate_sessions_value(&sessions)?;
        let journal = ExamSubmissionJournal {
            journal_version: 1,
            transaction_id: Uuid::new_v4().to_string(),
            phase: JournalPhase::Prepared,
            before_entries,
            after_entries: snapshot_from_bytes(Some(entries_document_bytes(&entries)?)),
            before_sessions,
            after_sessions: snapshot_from_bytes(Some(sessions_document_bytes(&sessions)?)),
        };
        write_journal(journal_path, &journal)?;
        let mut journal = journal;

        let result = (|| {
            restore_snapshot(store.entries_path(), &journal.after_entries)?;
            journal.phase = JournalPhase::EntriesWritten;
            write_journal(journal_path, &journal)?;
            restore_snapshot(sessions_path, &journal.after_sessions)?;
            journal.phase = JournalPhase::SessionsWritten;
            write_journal(journal_path, &journal)?;
            verify_after(store.entries_path(), sessions_path, &journal)
        })();
        if let Err(error) = result {
            let rollback = restore_snapshot(store.entries_path(), &journal.before_entries)
                .and_then(|_| restore_snapshot(sessions_path, &journal.before_sessions));
            if rollback.is_ok() {
                let _ = fs::remove_file(journal_path);
                return Err(error);
            }
            return Err(format!(
                "{error} 복구 journal을 유지했습니다: {}",
                rollback.unwrap_err()
            ));
        }
        fs::remove_file(journal_path).map_err(|error| error.to_string())?;
        Ok(ExamSubmissionTransactionResult {
            entries,
            sessions,
            added_entry_ids,
            revision: store.entries_revision()?,
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notebook_store::NotebookStore;
    use serde_json::json;

    fn entry(id: &str, session: Option<&str>, number: Option<&str>) -> WrongAnswerEntry {
        serde_json::from_value(json!({
            "id": id, "subject": "수학", "question": "문제", "myAnswer": "", "correctAnswer": "",
            "createdAt": "a", "updatedAt": "a", "mastered": false,
            "generatedFromExamSessionId": session, "generatedFromQuestionNumber": number,
        }))
        .expect("entry")
    }

    fn submitted_session(id: &str) -> Value {
        json!({"id": id, "status":"submitted", "startedAt":"a", "updatedAt":"b", "submittedAt":"c", "questions":[], "responses":[]})
    }

    #[test]
    fn transaction_commits_session_and_deduplicated_entries_together() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = NotebookStore::new(dir.path().join("entries.json"), dir.path().join("images"));
        let sessions = dir.path().join("exam-sessions.json");
        let journal = dir.path().join(EXAM_SUBMISSION_JOURNAL_FILE);
        store
            .save_entries(&[entry("old", Some("session-1"), Some("01"))])
            .expect("seed");
        let result = submit_exam_transaction(
            &store,
            &sessions,
            &journal,
            ExamSubmissionTransactionInput {
                submitted_session: submitted_session("session-1"),
                derived_entries: vec![
                    entry("duplicate", Some("session-1"), Some("1번")),
                    entry("new", Some("session-1"), Some("2")),
                ],
            },
        )
        .expect("commit");
        assert_eq!(result.added_entry_ids, vec!["new"]);
        assert_eq!(result.entries.len(), 2);
        assert_eq!(result.sessions[0]["id"], "session-1");
        assert!(!journal.exists());
    }

    #[test]
    fn mixed_journal_is_rolled_forward_but_unknown_bytes_are_blocked() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = NotebookStore::new(dir.path().join("entries.json"), dir.path().join("images"));
        let sessions = dir.path().join("exam-sessions.json");
        let journal_path = dir.path().join(EXAM_SUBMISSION_JOURNAL_FILE);
        let before = vec![entry("old", None, None)];
        let after = vec![entry("new", Some("s"), Some("1"))];
        store.save_entries(&before).expect("seed");
        write_json_atomic(&sessions, &json!([])).expect("sessions");
        let journal = ExamSubmissionJournal {
            journal_version: 1,
            transaction_id: "tx".into(),
            phase: JournalPhase::Prepared,
            before_entries: read_snapshot(store.entries_path()).unwrap(),
            after_entries: snapshot_from_bytes(Some(entries_document_bytes(&after).unwrap())),
            before_sessions: read_snapshot(&sessions).unwrap(),
            after_sessions: snapshot_from_bytes(Some(
                sessions_document_bytes(&json!([submitted_session("s")])).unwrap(),
            )),
        };
        write_journal(&journal_path, &journal).expect("journal");
        restore_snapshot(store.entries_path(), &journal.after_entries)
            .expect("simulate entries write");
        reconcile_exam_submission(&store, &sessions, &journal_path).expect("roll forward");
        assert_eq!(read_sessions_value(&sessions).unwrap()[0]["id"], "s");
        assert!(!journal_path.exists());

        write_journal(&journal_path, &journal).expect("journal again");
        write_bytes_atomic(store.entries_path(), b"[]").expect("unknown entries");
        assert!(reconcile_exam_submission(&store, &sessions, &journal_path).is_err());
        assert!(journal_path.exists());
    }

    #[test]
    fn pending_journal_blocks_backup_until_reconciled() {
        let directory = tempfile::tempdir().expect("tempdir");
        let journal_path = directory.path().join(EXAM_SUBMISSION_JOURNAL_FILE);
        assert!(ensure_no_pending_exam_submission_journal(&journal_path).is_ok());
        fs::write(&journal_path, b"pending").expect("seed journal");
        assert!(ensure_no_pending_exam_submission_journal(&journal_path).is_err());
    }
}
