import type { QuestionBankItem } from "../model/questionBankTypes";

export type QuestionBankViewMode = "unit" | "source" | "recent" | "important";

export interface QuestionBankGroup {
  key: string;
  label: string;
  items: QuestionBankItem[];
}

function compareLabel(a: string, b: string): number {
  return a.localeCompare(b, "ko-KR", { numeric: true, sensitivity: "base" });
}

export function groupQuestionBankItems(items: QuestionBankItem[], mode: QuestionBankViewMode): QuestionBankGroup[] {
  if (mode === "recent") {
    const reviewed = [...items].filter((item) => item.lastReviewedAt).sort((a, b) => (b.lastReviewedAt ?? "").localeCompare(a.lastReviewedAt ?? ""));
    const modified = [...items].filter((item) => !item.lastReviewedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return [
      ...(reviewed.length ? [{ key: "recent", label: "최근 학습", items: reviewed }] : []),
      ...(modified.length ? [{ key: "recent-modified", label: "최근 수정 자료", items: modified }] : []),
    ];
  }
  if (mode === "important") {
    const important = items.filter((item) => item.isImportant === true);
    return [{ key: "important", label: "중요 문제", items: important }];
  }

  const groups = new Map<string, QuestionBankItem[]>();
  for (const item of items) {
    const label = mode === "unit"
      ? item.classification.curriculum?.trim()
        ? [item.classification.subject?.trim() || item.subject?.trim(), item.classification.curriculum.trim(), item.classification.unit?.trim() || "미분류"].filter(Boolean).join(" › ")
        : item.classification.unit?.trim() || "미분류"
      : item.source.sourceLabel?.trim() || item.source.seriesName?.trim() || item.entryTitle || "미분류 자료";
    const group = groups.get(label) ?? [];
    group.push(item);
    groups.set(label, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a === "미분류" ? -1 : b === "미분류" ? 1 : compareLabel(a, b))
    .map(([label, group]) => ({ key: `${mode}:${label}`, label, items: group }));
}
