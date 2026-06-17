import { useState, type FormEvent } from "react";
import type { EntryFormData, Subject } from "../types";

interface QuickConceptPanelProps {
  subject: Subject;
  onCreate: (data: EntryFormData) => Promise<void>;
}

function parseTags(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[,#\n]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}

function titleFromSummary(summary: string): string {
  return summary
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 60) || "빠른 개념";
}

export function createQuickConceptData(
  title: string,
  summary: string,
  tagsInput: string,
  subject: Subject,
): EntryFormData {
  const trimmedTitle = title.trim();
  const trimmedSummary = summary.trim();
  const conceptTitle = trimmedTitle || titleFromSummary(trimmedSummary);

  return {
    subject,
    title: conceptTitle,
    question: trimmedSummary || conceptTitle,
    questionImages: [],
    entryKind: "concept",
    difficult: false,
    difficulty: "none",
    myAnswer: "",
    correctAnswer: "",
    explanationParts: [],
    memo: "",
    annotations: [],
    tags: parseTags(tagsInput),
    answerKey: [],
    checklist: [],
    mastered: false,
  };
}

export default function QuickConceptPanel({ subject, onCreate }: QuickConceptPanelProps) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = Boolean(title.trim() || summary.trim());

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCreate || saving) return;

    setSaving(true);
    setError(null);
    try {
      await onCreate(createQuickConceptData(title, summary, tags, subject));
      setTitle("");
      setSummary("");
      setTags("");
    } catch (createError) {
      setError(
        createError instanceof Error && createError.message
          ? createError.message
          : "빠른 개념을 추가하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="quick-concept-panel" onSubmit={submit} aria-label="빠른 개념 추가">
      <div className="quick-concept-head">
        <strong>빠른 개념 추가</strong>
        <span>짧게 적어두고 나중에 자세히 보강하세요.</span>
      </div>
      <div className="quick-concept-fields">
        <input
          aria-label="빠른 개념명"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="개념명"
        />
        <input
          aria-label="빠른 개념 요약"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="한 줄 요약"
        />
        <input
          aria-label="빠른 개념 태그"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="태그, 쉼표로 구분"
        />
        <button type="submit" className="btn-primary" disabled={!canCreate || saving}>
          {saving ? "추가 중..." : "추가"}
        </button>
      </div>
      {error && (
        <p className="quick-concept-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
