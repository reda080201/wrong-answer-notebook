import type { SupplementalResourceKind } from "../../../types";
import type { EntryFormData } from "../../../types";

export type SupplementalImportMode = "answer_key" | "answer_and_solution" | "solution" | "source_pages" | "correction";

export function supplementalKindForMode(mode: SupplementalImportMode): SupplementalResourceKind {
  if (mode === "answer_key") return "answer_key";
  if (mode === "solution" || mode === "answer_and_solution") return "solution";
  if (mode === "source_pages") return "source_pages";
  return "correction";
}

export function supplementalModeLabel(mode: SupplementalImportMode): string {
  if (mode === "answer_key") return "답지만 추가";
  if (mode === "answer_and_solution") return "답지와 해설 추가";
  if (mode === "solution") return "해설만 추가";
  if (mode === "source_pages") return "원본 페이지 추가";
  return "정오표·보충자료 추가";
}

export function allowedFieldsForSupplementalMode(mode: SupplementalImportMode) {
  if (mode === "answer_key") return ["answerKey", "sourcePageImages"] as const;
  if (mode === "solution") return ["answerKey", "explanationParts", "figures", "learningBlocks", "sourcePageImages"] as const;
  if (mode === "source_pages") return ["sourcePageImages", "figures"] as const;
  return ["answerKey", "explanationParts", "figures", "learningBlocks", "sourcePageImages"] as const;
}

export function filterSupplementalData(data: Partial<EntryFormData>, mode: SupplementalImportMode): Partial<EntryFormData> {
  if (!data.answerKey?.length) return data;
  const answerKey = data.answerKey.map((item) => {
    if (mode === "answer_key") {
      return { ...item, explanation: "", strategy: undefined, steps: undefined, choiceJudgements: undefined, wrongPoint: undefined, reviewPoint: undefined, notes: undefined, mistakeAnalysis: undefined, importantPoints: [], difficulty: undefined, difficultyScore: undefined, concepts: undefined, diagramType: undefined, diagramSpec: undefined, needsReview: undefined, sourceNote: undefined };
    }
    if (mode === "solution") return { ...item, answer: "" };
    return item;
  });
  return { ...data, answerKey };
}
