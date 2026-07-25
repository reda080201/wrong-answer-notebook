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
            let haystack = entry_search_text(entry).to_lowercase();
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
            for figure in entry.figures {
                if let Some(image) = figure.image { referenced.insert(image); }
                for key in ["original", "cleaned"] {
                    if let Some(image) = figure.extra.get(key).and_then(|value| value.get("image")).and_then(Value::as_str) { referenced.insert(image.to_owned()); }
                }
            }
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

/// Searchable text intentionally includes concepts stored at both entry and
/// answer-key/question level without changing the persisted model.
pub fn entry_search_text(entry: &WrongAnswerEntry) -> String {
    let mut parts = vec![
        entry.title.clone(),
        entry.question.clone(),
        entry.memo.clone(),
        entry.tags.join(" "),
    ];
    append_json_search_text(entry.extra.get("concepts"), &mut parts);
    for answer in &entry.answer_key {
        append_json_search_text(answer.get("concepts"), &mut parts);
        append_json_search_text(answer.get("strategy"), &mut parts);
        append_json_search_text(answer.get("importantPoints"), &mut parts);
    }
    parts.retain(|value| !value.trim().is_empty());
    parts.join("\n")
}

fn append_json_search_text(value: Option<&Value>, parts: &mut Vec<String>) {
    match value {
        Some(Value::String(text)) => parts.push(text.clone()),
        Some(Value::Array(values)) => values.iter().for_each(|item| append_json_search_text(Some(item), parts)),
        _ => {}
    }
}

/// Returns a bounded excerpt centred on an actual match instead of blindly
/// returning the beginning of a long question sheet.
pub fn matched_snippet(entry: &WrongAnswerEntry, query: &str, max_chars: usize) -> String {
    let text = entry_search_text(entry);
    let needle = query.trim();
    if needle.is_empty() { return text.chars().take(max_chars).collect(); }
    let lowered = text.to_lowercase();
    let lowered_needle = needle.to_lowercase();
    let Some(byte_index) = lowered.find(&lowered_needle) else {
        return text.chars().take(max_chars).collect();
    };
    let start_chars = text[..byte_index].chars().count().saturating_sub(max_chars / 3);
    let all_chars: Vec<char> = text.chars().collect();
    let end_chars = (start_chars + max_chars).min(all_chars.len());
    let mut snippet: String = all_chars[start_chars..end_chars].iter().collect();
    if start_chars > 0 { snippet.insert_str(0, "..."); }
    if end_chars < all_chars.len() { snippet.push_str("..."); }
    snippet
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

/// Line parser kept deliberately in parity with the frontend `parseQuestionText`:
/// it identifies the same question headers and never treats choice markers as
/// question headers after body text has started.
pub fn parse_question_blocks(text: &str) -> Vec<(String, String, Vec<String>)> {
    let lines: Vec<&str> = text.lines().collect();
    let starts: Vec<usize> = lines.iter().enumerate().filter_map(|(index, line)| {
        let previous = index.checked_sub(1).and_then(|value| lines.get(value)).copied();
        is_question_start(line, previous).then_some(index)
    }).collect();

    starts.iter().enumerate().filter_map(|(position, &start)| {
        let end = starts.get(position + 1).copied().unwrap_or(lines.len());
        let first = *lines.get(start)?;
        let (number, prefix_len) = parse_number_prefix(first.trim_start())?;
        let mut body = Vec::new();
        let mut choices = Vec::new();
        let mut inside_view = false;
        for (line_index, line) in lines[start..end].iter().enumerate() {
            if line_index == 0 {
                let leading = line.len() - line.trim_start().len();
                let content = &line[(leading + prefix_len).min(line.len())..];
                if !content.trim().is_empty() { body.push(content.trim().to_owned()); }
                continue;
            }
            let trimmed = line.trim();
            if is_view_marker(trimmed) { inside_view = true; body.push(trimmed.to_owned()); continue; }
            if inside_view && is_view_item(trimmed) { body.push(trimmed.to_owned()); continue; }
            if is_choice_prefix(trimmed) { inside_view = false; choices.push(trimmed.to_owned()); }
            else if !trimmed.is_empty() { body.push(trimmed.to_owned()); }
        }
        Some((number, body.join("\n"), choices))
    }).collect()
}

fn is_question_start(value: &str, previous: Option<&str>) -> bool {
    let value = value.trim_start();
    let Some(_) = parse_number_prefix(value) else { return false; };
    !(has_numeric_close_marker(value) && previous.is_some_and(|line| !line.trim().is_empty()))
}

fn has_numeric_close_marker(value: &str) -> bool {
    let digits: String = value.chars().take_while(|character| character.is_ascii_digit()).collect();
    !digits.is_empty() && value[digits.len()..].starts_with(')')
}

fn parse_number_prefix(value: &str) -> Option<(String, usize)> {
    let value = value.trim_start();
    if let Some(rest) = value.strip_prefix("[문제 ") {
        let digits: String = rest.chars().take_while(|character| character.is_ascii_digit()).collect();
        let consumed = "[문제 ".len() + digits.len();
        if !digits.is_empty() && rest[digits.len()..].starts_with(']') {
            return Some((normalize_question_number(&digits), consumed + 1));
        }
    }
    for prefix in ["문제 ", "#"] {
        if let Some(rest) = value.strip_prefix(prefix) {
            let digits: String = rest.chars().take_while(|character| character.is_ascii_digit()).collect();
            if !digits.is_empty() {
                return Some((normalize_question_number(&digits), prefix.len() + digits.len()));
            }
        }
    }
    let digits: String = value.chars().take_while(|character| character.is_ascii_digit()).collect();
    if digits.is_empty() { return None; }
    let suffix = &value[digits.len()..];
    if suffix.starts_with('.') || suffix.starts_with(')') || suffix.starts_with("번") {
        Some((normalize_question_number(&digits), digits.len() + if suffix.starts_with("번") { "번".len() } else { 1 }))
    } else { None }
}

fn is_choice_prefix(value: &str) -> bool {
    let first = value.chars().next();
    if matches!(first, Some('①' | '②' | '③' | '④' | '⑤' | '⑥' | '⑦' | '⑧' | '⑨' | '⑩')) { return true; }
    let bytes = value.as_bytes();
    if value.starts_with('(') && bytes.get(1).is_some_and(|byte| byte.is_ascii_digit()) { return true; }
    if value.chars().next().is_some_and(|character| character.is_ascii_digit()) && value.chars().skip_while(|character| character.is_ascii_digit()).next() == Some(')') { return true; }
    let mut chars = value.chars();
    let Some(first) = chars.next() else { return false; };
    matches!(first, 'ㄱ'..='ㅎ' | 'A'..='E' | 'a'..='e') && matches!(chars.next(), Some('.' | ')'))
}

fn is_view_marker(value: &str) -> bool { matches!(value, "보기" | "<보기>") }
fn is_view_item(value: &str) -> bool {
    let mut chars = value.chars();
    matches!((chars.next(), chars.next()), (Some('ㄱ'..='ㅎ'), Some('.' | ')')))
}

#[cfg(test)]
mod tests {
    use super::{entry_search_text, matched_snippet, normalize_question_number, parse_question_blocks, parse_entries_value, NotebookStore};
    use crate::SheetFigureItem;
    use serde_json::json;
    #[test]
    fn normalizes_import_number_forms() {
        for value in ["01", "1", "1.", "1번", "문제 1", "#1", "10.", "문제 10"] {
            assert_eq!(normalize_question_number(value), if value.contains("10") { "10" } else { "1" });
        }
    }

    #[test]
    fn parses_frontend_question_forms_without_promoting_choices() {
        let text = "[문제 1] 첫 문제\n조건: x > 0\n① 선택지\n(1) 보기\n1) 보기\nㄱ. 보기\nA. 보기\n문제 10 둘째 문제\n<보기>\nㄱ. 참\n① ㄱ";
        let blocks = parse_question_blocks(text);
        assert_eq!(blocks.iter().map(|(number, _, _)| number.as_str()).collect::<Vec<_>>(), ["1", "10"]);
        assert!(blocks[0].1.contains("조건"));
        assert!(!blocks[0].1.contains("① 선택지"));
        assert_eq!(blocks[0].2.len(), 5);
        assert!(blocks[1].1.contains("ㄱ. 참"));
    }

    #[test]
    fn satisfies_shared_question_parser_fixture() {
        let fixture: Vec<serde_json::Value> = serde_json::from_str(include_str!(
            "../../../src/fixtures/question-parser-parity.json"
        )).expect("shared fixture must be valid JSON");
        for case in fixture {
            let source = case["source"].as_str().expect("source");
            let expected_numbers: Vec<&str> = case["numbers"].as_array().expect("numbers")
                .iter().map(|value| value.as_str().expect("number")).collect();
            let expected_bodies: Vec<&str> = case["bodies"].as_array().expect("bodies")
                .iter().map(|value| value.as_str().expect("body")).collect();
            let parsed = parse_question_blocks(source);
            assert_eq!(parsed.iter().map(|(number, _, _)| number.as_str()).collect::<Vec<_>>(), expected_numbers);
            assert_eq!(parsed.iter().map(|(_, body, _)| body.as_str()).collect::<Vec<_>>(), expected_bodies);
        }
    }

    #[test]
    fn searches_entry_and_question_concepts_and_centres_snippet() {
        let entry = serde_json::from_value(json!({
            "id":"e1", "subject":"윤리", "question":"긴 본문", "myAnswer":"", "correctAnswer":"", "createdAt":"a", "updatedAt":"b", "mastered":false,
            "concepts":["칸트 의무론"],
            "answerKey":[{"questionNumber":"1","concepts":["정언명령"]}]
        })).unwrap();
        assert!(entry_search_text(&entry).contains("정언명령"));
        assert!(matched_snippet(&entry, "정언명령", 30).contains("정언명령"));
    }

    #[test]
    fn figure_round_trip_preserves_current_and_unknown_fields() {
        let entries = parse_entries_value(json!([{
            "id":"e1", "subject":"수학", "question":"1. 문제", "myAnswer":"", "correctAnswer":"", "createdAt":"a", "updatedAt":"b", "mastered":false,
            "figures":[{"id":"f1","questionNumber":"1","title":"그래프","caption":"설명","image":"f.png","source":"described_only","needsReview":true,"future":{"nested":true}}]
        }])).unwrap();
        let figure: &SheetFigureItem = &entries[0].figures[0];
        assert_eq!(figure.question_number, "1");
        assert_eq!(figure.source, "described_only");
        assert_eq!(figure.extra["future"]["nested"], true);
        let written = serde_json::to_value(&entries).unwrap();
        assert_eq!(written[0]["figures"][0]["future"]["nested"], true);
    }

    #[test]
    fn store_round_trip_keeps_figure_fields_and_unknown_nested_data() {
        let entries = parse_entries_value(json!([{
            "id":"e1", "subject":"수학", "question":"1. 문제", "myAnswer":"", "correctAnswer":"", "createdAt":"a", "updatedAt":"b", "mastered":false,
            "figures":[{"id":"f1","questionNumber":"1","title":"그래프","caption":"설명","image":"f.png","source":"gpt_cleaned","needsReview":false,"future":{"nested":{"kept":true}}}]
        }])).unwrap();
        let directory = tempfile::tempdir().unwrap();
        let store = NotebookStore::new(directory.path().join("entries.json"), directory.path().join("images"));
        store.save_entries(&entries).unwrap();
        let restored = store.load_entries().unwrap();
        let figure = &restored[0].figures[0];
        assert_eq!(figure.id, "f1");
        assert_eq!(figure.question_number, "1");
        assert_eq!(figure.title, "그래프");
        assert_eq!(figure.caption, "설명");
        assert_eq!(figure.image.as_deref(), Some("f.png"));
        assert_eq!(figure.source, "gpt_cleaned");
        assert_eq!(figure.needs_review, Some(false));
        assert_eq!(figure.extra["future"]["nested"]["kept"], true);
    }
}
