use serde_json::Value;

fn records(value: &Value) -> bool {
    value
        .as_array()
        .is_some_and(|items| items.iter().all(Value::is_object))
}

fn strings(value: &Value) -> bool {
    value
        .as_array()
        .is_some_and(|items| items.iter().all(Value::is_string))
}

fn safe_shape(value: &Value) -> bool {
    match value {
        Value::Array(items) => items.iter().all(safe_shape),
        Value::Object(fields) => fields.iter().all(|(key, child)| {
            let valid = match key.as_str() {
                "images"
                | "questionImages"
                | "explanationImages"
                | "sourcePageImages"
                | "selectedSourcePageImages"
                | "linkedSourcePageImages"
                | "imageReferences"
                | "questionImageAssets"
                | "sourcePageAssets" => strings(child),
                "questions"
                | "structuredQuestions"
                | "figures"
                | "solutionFigures"
                | "learningBlocks"
                | "explanationParts"
                | "questionSourceCrops"
                | "questionSolutionHotspots"
                | "contentSegments"
                | "groups"
                | "assets"
                | "preparedEntries" => records(child),
                "questionContentSegments" => child
                    .as_object()
                    .is_some_and(|map| map.values().all(records)),
                "questionSnapshot" | "entry" | "commitAttempt" | "assetSession" => {
                    child.is_object()
                }
                "image"
                | "filename"
                | "stagedFilename"
                | "sourcePageImage"
                | "renderedQuestionPng" => child.is_null() || child.is_string(),
                "sourceToSaved" | "sourceToStaged" => child
                    .as_object()
                    .is_some_and(|map| map.values().all(Value::is_string)),
                _ => true,
            };
            valid && safe_shape(child)
        }),
        _ => true,
    }
}

/// Image deletion must validate raw documents before any normalization or filtering.
pub(crate) fn validate_reference_document(value: &Value, name: &str) -> Result<(), String> {
    let valid = match name {
        "entries.json" => records(if value.is_array() {
            value
        } else {
            &value["entries"]
        }),
        "exam-sessions.json" | "generated-exams.json" => {
            records(value)
                && value
                    .as_array()
                    .unwrap()
                    .iter()
                    .all(|item| records(&item["questions"]))
        }
        "gpt-solution-drafts.json" => {
            records(value)
                && value.as_array().unwrap().iter().all(|item| {
                    item["questionSnapshot"].is_object()
                        && records(&item["questionSnapshot"]["questions"])
                })
        }
        "pending-deletions.json" => {
            records(value)
                && value
                    .as_array()
                    .unwrap()
                    .iter()
                    .all(|item| strings(&item["imageReferences"]))
        }
        "import-workspace-draft.json" => {
            value.is_null()
                || (value.is_object()
                    && records(&value["assets"])
                    && records(&value["groups"])
                    && value["groups"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .all(|group| records(&group["questions"])))
        }
        _ => value.is_object() || records(value),
    };
    if valid && safe_shape(value) {
        Ok(())
    } else {
        Err(format!(
            "저장된 이미지 참조({name}) 구조가 올바르지 않습니다."
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rejects_parseable_corruption_in_every_reference_store() {
        for (name, value) in [
            (
                "entries.json",
                json!({"entries":[{"questionImages":"lost"}]}),
            ),
            ("exam-sessions.json", json!({"broken":"lost array"})),
            (
                "exam-sessions.json",
                json!([{"questions":[{"figures":"lost"}]}]),
            ),
            ("generated-exams.json", json!([{"questions":[null]}])),
            ("gpt-solution-drafts.json", json!([{}])),
            (
                "pending-deletions.json",
                json!([{"imageReferences":"lost"}]),
            ),
            ("import-workspace-draft.json", json!({})),
        ] {
            assert!(validate_reference_document(&value, name).is_err(), "{name}");
        }
    }

    #[test]
    fn accepts_legacy_arrays_and_documented_empty_values() {
        assert!(validate_reference_document(&json!([]), "entries.json").is_ok());
        assert!(validate_reference_document(
            &json!({"schemaVersion":2,"entries":[]}),
            "entries.json"
        )
        .is_ok());
        assert!(validate_reference_document(&Value::Null, "import-workspace-draft.json").is_ok());
        for name in [
            "exam-sessions.json",
            "generated-exams.json",
            "gpt-solution-drafts.json",
            "pending-deletions.json",
        ] {
            assert!(validate_reference_document(&json!([]), name).is_ok());
            assert!(validate_reference_document(&Value::Null, name).is_err());
        }
    }
}
