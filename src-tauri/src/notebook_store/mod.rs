//! Single-owner persistence layer for the notebook data file.
//!
//! Tauri commands and the local MCP bridge both read through this type.  The
//! bridge deliberately receives only its read APIs; mutations stay in the
//! desktop application commands.

use crate::WrongAnswerEntry;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const ENTRIES_SCHEMA_VERSION: u32 = 2;

#[derive(Debug)]
pub struct NotebookStore {
    entries_path: PathBuf,
    images_path: PathBuf,
    write_lock: Mutex<()>,
}

#[derive(Debug, Clone)]
pub struct SearchQuery<'a> {
    pub query: &'a str,
    pub subject: Option<&'a str>,
    pub entry_kind: Option<&'a str>,
    pub limit: usize,
}

#[derive(Debug, Clone)]
pub struct QuestionRecord {
    pub entry: WrongAnswerEntry,
    pub question_number: String,
    pub body: String,
    pub choices: Vec<String>,
    pub answer_key: Option<Value>,
}

impl NotebookStore {
    pub fn new(entries_path: PathBuf, images_path: PathBuf) -> Self {
        Self { entries_path, images_path, write_lock: Mutex::new(()) }
    }

    pub fn entries_path(&self) -> &Path { &self.entries_path }
    pub fn images_path(&self) -> &Path { &self.images_path }

    /// Accepts the historical array format and the current schema-v2 wrapper.
    pub fn load_entries(&self) -> Result<Vec<WrongAnswerEntry>, String> {
        if !self.entries_path.exists() { return Ok(Vec::new()); }
        let raw = fs::read_to_string(&self.entries_path).map_err(|error| error.to_string())?;
        if raw.trim().is_empty() { return Ok(Vec::new()); }
        let value: Value = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
        parse_entries_value(value)
    }

    pub fn save_entries(&self, entries: &[WrongAnswerEntry]) -> Result<(), String> {
        let _guard = self.write_lock.lock().map_err(|_| "노트 저장 잠금을 얻지 못했습니다.".to_owned())?;
        self.write_entries_locked(entries)
    }

    pub fn get_entry(&self, entry_id: &str) -> Result<Option<WrongAnswerEntry>, String> {
        Ok(self.load_entries()?.into_iter().find(|entry| entry.id == entry_id))
    }

    pub fn search(&self, query: SearchQuery<'_>) -> Result<Vec<WrongAnswerEntry>, String> {
        let needle = query.query.trim().to_lowercase();
        let subject = query.subject.map(|value| value.trim().to_lowercase()).filter(|value| !value.is_empty());
        let entry_kind = query.entry_kind.map(str::trim).filter(|value| !value.is_empty());
        let limit = query.limit.clamp(1, 50);
        Ok(self.load_entries()?.into_iter().filter(|entry| {
            let matches_subject = subject.as_ref().map_or(true, |value| entry.subject.to_lowercase() == *value);
            let matches_kind = entry_kind.map_or(true, |value| entry.entry_kind == value);
            let haystack = format!("{}\n{}\n{}\n{}", entry.title, entry.question, entry.memo, entry.tags.join(" ")).to_lowercase();
            matches_subject && matches_kind && (needle.is_empty() || haystack.contains(&needle))
        }).take(limit).collect())
    }

    pub fn get_question(&self, entry_id: &str, question_number: &str) -> Result<Option<QuestionRecord>, String> {
        let wanted = normalize_question_number(question_number);
        let Some(entry) = self.get_entry(entry_id)? else { return Ok(None); };
        if entry.entry_kind != "problem_sheet" {
            return Ok(Some(QuestionRecord { body: entry.question.clone(), choices: Vec::new(), answer_key: None, question_number: wanted, entry }));
        }
        let blocks = parse_question_blocks(&entry.question);
        let Some((number, body, choices)) = blocks.into_iter().find(|(number, _, _)| normalize_question_number(number) == wanted) else { return Ok(None); };
        let answer_key = entry.answer_key.iter().find(|item| {
            item.get("questionNumber").and_then(Value::as_str).map(normalize_question_number).as_deref() == Some(wanted.as_str())
        }).cloned();
        Ok(Some(QuestionRecord { entry, question_number: number, body, choices, answer_key }))
    }

    pub fn referenced_image_filenames(&self) -> Result<HashSet<String>, String> {
        let mut referenced = HashSet::new();
        for entry in self.load_entries()? {
            referenced.extend(entry.question_images);
            referenced.extend(entry.explanation_images);
            referenced.extend(entry.images);
            referenced.extend(entry.explanation_parts.into_iter().flat_map(|part| part.images));
            referenced.extend(entry.figures.into_iter().filter_map(|figure| figure.image));
        }
        Ok(referenced)
    }

    pub fn is_referenced_image(&self, filename: &str) -> Result<bool, String> {
        Ok(self.referenced_image_filenames()?.contains(filename))
    }

    fn write_entries_locked(&self, entries: &[WrongAnswerEntry]) -> Result<(), String> {
        if let Some(parent) = self.entries_path.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
        let document = serde_json::json!({ "schemaVersion": ENTRIES_SCHEMA_VERSION, "entries": entries });
        let bytes = serde_json::to_vec_pretty(&document).map_err(|error| error.to_string())?;
        let parent = self.entries_path.parent().ok_or_else(|| "저장 경로를 확인할 수 없습니다.".to_owned())?;
        let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
        use std::io::Write;
        temp.write_all(&bytes).map_err(|error| error.to_string())?;
        temp.flush().map_err(|error| error.to_string())?;
        temp.persist(&self.entries_path).map_err(|error| error.error.to_string())?;
        Ok(())
    }
}

pub fn parse_entries_value(value: Value) -> Result<Vec<WrongAnswerEntry>, String> {
    let entries = match value {
        Value::Array(entries) => entries,
        Value::Object(mut document) => match document.remove("entries") {
            Some(Value::Array(entries)) => entries,
            _ => return Err("저장 데이터 형식이 올바르지 않습니다.".to_owned()),
        },
        _ => return Err("저장 데이터 형식이 올바르지 않습니다.".to_owned()),
    };
    entries.into_iter().map(|entry| serde_json::from_value(entry).map_err(|error| error.to_string())).collect()
}

/// The same human forms accepted by the import validator: 01, 1., 1번, 문제 1, #1.
pub fn normalize_question_number(value: &str) -> String {
    let value = value.trim().trim_start_matches('#').trim().trim_start_matches("문제").trim();
    let value = value.strip_suffix('번').unwrap_or(value).trim_end_matches('.').trim();
    if value.chars().all(|character| character.is_ascii_digit()) {
        value.parse::<u32>().map(|number| number.to_string()).unwrap_or_else(|_| value.to_owned())
    } else { value.to_owned() }
}

/// Conservative line parser used by the bridge only. It never rewrites saved question text.
pub fn parse_question_blocks(text: &str) -> Vec<(String, String, Vec<String>)> {
    let mut blocks: Vec<(String, Vec<String>)> = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        let number = parse_number_prefix(trimmed);
        if let Some(number) = number {
            blocks.push((number, vec![line.to_owned()]));
        } else if let Some((_, lines)) = blocks.last_mut() { lines.push(line.to_owned()); }
    }
    blocks.into_iter().map(|(number, lines)| {
        let choices = lines.iter().filter(|line| {
            matches!(line.trim_start().chars().next(), Some('①' | '②' | '③' | '④' | '⑤'))
        }).cloned().collect();
        (number, lines.join("\n").trim().to_owned(), choices)
    }).collect()
}

fn parse_number_prefix(value: &str) -> Option<String> {
    let value = value.strip_prefix("[문제 ").and_then(|rest| rest.strip_suffix(']')).unwrap_or(value);
    let value = value.strip_prefix("문제 ").unwrap_or(value).trim_start_matches('#');
    let digits: String = value.chars().take_while(|character| character.is_ascii_digit()).collect();
    if digits.is_empty() { return None; }
    let suffix = &value[digits.len()..];
    if suffix.starts_with('.') || suffix.starts_with("번") || suffix.starts_with(")") || suffix.starts_with(" ") {
        Some(normalize_question_number(&digits))
    } else { None }
}

#[cfg(test)]
mod tests {
    use super::normalize_question_number;
    #[test]
    fn normalizes_import_number_forms() {
        for value in ["01", "1", "1.", "1번", "문제 1", "#1", "10.", "문제 10"] {
            assert_eq!(normalize_question_number(value), if value.contains("10") { "10" } else { "1" });
        }
    }
}
