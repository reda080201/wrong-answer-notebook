import type { EntryFormData, ImportAudit } from "../types";
import { parseQuestionText } from "./textLayout";
import { normalizeImportAudit, normalizeRejectedNotes } from "./importAudit";

export type ImportValidationSeverity = "info" | "warning" | "error";

export interface ImportValidationIssue {
  id: string;
  severity: ImportValidationSeverity;
  message: string;
}

export interface ImportValidationReport {
  questionNumbers: string[];
  answerNumbers: string[];
  issues: ImportValidationIssue[];
  audit?: ImportAudit;
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value);
    seen.add(value);
  }
  return [...duplicate];
}

function normalizeNumber(value: string): string {
  return value.trim().replace(/^#/, "").replace(/[.)번]\s*$/, "").replace(/^0+/, "") || value.trim();
}

function memoLooksQuestionSpecific(memo: string): boolean {
  return /(?:문제|문항)\s*#?\d{1,3}\s*(?:번)?|#?\d{1,3}\s*번\s*(?:문제|문항|메모|포인트|풀이)/.test(memo);
}

function compactText(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function tokenSet(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^0-9a-z가-힣]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  );
}

function hasRejectedNoteLeak(note: string, fields: string[]): boolean {
  const compactNote = compactText(note);
  if (compactNote.length < 4) return false;
  const noteTokens = tokenSet(note);
  for (const field of fields) {
    const compactField = compactText(field);
    if (!compactField) continue;
    if (compactField.includes(compactNote)) return true;
    if (compactNote.length >= 8 && compactField.includes(compactNote.slice(0, Math.max(6, Math.floor(compactNote.length * 0.7))))) {
      return true;
    }
    if (noteTokens.size >= 3) {
      const fieldTokens = tokenSet(field);
      const overlap = [...noteTokens].filter((token) => fieldTokens.has(token)).length;
      if (overlap >= Math.ceil(noteTokens.size * 0.7)) return true;
    }
  }
  return false;
}

export function getQuestionNumbers(question: string): string[] {
  return parseQuestionText(question)
    .filter((block) => block.kind === "question")
    .map((block) => String(block.displayNumber))
    .filter(Boolean);
}

export function validateImportedStudyData(data: Partial<EntryFormData>): ImportValidationReport {
  const questionBlocks = parseQuestionText(data.question ?? "").filter((block) => block.kind === "question");
  const questionNumbers = questionBlocks.map((block) => String(block.displayNumber));
  const connectableQuestionNumbers = questionBlocks.flatMap((block) => [
    String(block.displayNumber),
    normalizeNumber(block.numberLabel),
  ]);
  const answerNumbers = (data.answerKey ?? [])
    .map((item) => item.questionNumber.trim())
    .filter(Boolean);
  const questionNumberSet = new Set(connectableQuestionNumbers.map(normalizeNumber));
  const answerNumberSet = new Set(answerNumbers.map(normalizeNumber));
  const issues: ImportValidationIssue[] = [];
  const audit = data.importAudit
    ? normalizeImportAudit(data.importAudit, data)
    : undefined;
  const rejectedNotes = normalizeRejectedNotes(data.rejectedNotes);

  for (const number of audit?.missingQuestionNumbers ?? []) {
    issues.push({
      id: `audit-missing-question-${number}`,
      severity: "error",
      message: `${number}번 문제가 이미지에서 예상됐지만 본문에 감지되지 않았습니다.`,
    });
  }
  if (audit?.uncertainQuestionNumbers.length) {
    issues.push({
      id: "audit-uncertain-questions",
      severity: "warning",
      message: `번호 또는 내용 확인이 필요한 문항: ${audit.uncertainQuestionNumbers.join(", ")}`,
    });
  }
  if (audit && !audit.handwritingExcluded) {
    issues.push({
      id: "audit-handwriting-not-excluded",
      severity: "error",
      message: "학생 손글씨와 풀이 흔적이 완전히 제외됐는지 확인되지 않았습니다.",
    });
  }
  if (rejectedNotes.length) {
    issues.push({
      id: "audit-rejected-notes",
      severity: "warning",
      message: `학생 필기 의심 내용 ${rejectedNotes.length}개가 학습 데이터에서 제외되었습니다.`,
    });
    const learningFields = [
      data.question ?? "",
      data.memo ?? "",
      ...(data.answerKey ?? []).flatMap((item) => [
        item.answer,
        item.explanation,
        item.notes ?? "",
        item.sourceNote ?? "",
        ...item.importantPoints,
      ]),
    ];
    const leakedNotes = rejectedNotes.filter((note) => hasRejectedNoteLeak(note, learningFields));
    if (leakedNotes.length) {
      issues.push({
        id: "rejected-note-possible-leak",
        severity: "error",
        message: "학생 필기 의심 내용이 문제/메모/답안에 남아 있을 수 있습니다. 미리보기에서 직접 확인하세요.",
      });
    }
  }
  if (audit?.needsReviewCount) {
    issues.push({
      id: "audit-needs-review",
      severity: "warning",
      message: `답안·도표 연결 등 ${audit.needsReviewCount}개 항목을 확인해야 합니다.`,
    });
  }
  for (const [index, figure] of (data.figures ?? []).entries()) {
    if (!figure.image) {
      issues.push({
        id: `unlinked-figure-${figure.id || index}`,
        severity: "error",
        message: `${figure.questionNumber || "번호 미상"} 도표/그림에 연결된 이미지가 없습니다.`,
      });
    }
  }

  for (const number of duplicates(questionNumbers)) {
    issues.push({
      id: `duplicate-question-${number}`,
      severity: "warning",
      message: `${number}번 문제가 본문에서 중복 감지되었습니다.`,
    });
  }

  for (const number of duplicates(answerNumbers)) {
    issues.push({
      id: `duplicate-answer-${number}`,
      severity: "warning",
      message: `${number}번 답안이 답안지에서 중복 감지되었습니다.`,
    });
  }

  for (const block of questionBlocks) {
    const displayNumber = String(block.displayNumber);
    if (!answerNumberSet.has(normalizeNumber(displayNumber)) && !answerNumberSet.has(normalizeNumber(block.numberLabel))) {
      issues.push({
        id: `missing-answer-${displayNumber}`,
        severity: "warning",
        message: `${displayNumber}번 문제에 연결된 답안이 없습니다.`,
      });
    }
  }

  for (const number of answerNumbers) {
    if (!questionNumberSet.has(normalizeNumber(number))) {
      issues.push({
        id: `extra-answer-${number}`,
        severity: "warning",
        message: `${number}번 답안은 본문 문제 번호와 연결되지 않았습니다.`,
      });
    }
  }

  for (const item of data.answerKey ?? []) {
    const label = item.questionNumber.trim() || "?";
    if (!item.answer.trim()) {
      issues.push({
        id: `empty-answer-${item.id}`,
        severity: "warning",
        message: `${label}번 답안의 정답이 비어 있습니다.`,
      });
    }
    if (!item.explanation.trim()) {
      issues.push({
        id: `empty-explanation-${item.id}`,
        severity: "info",
        message: `${label}번 답안의 풀이가 비어 있습니다.`,
      });
    }
  }

  if ((data.memo ?? "").trim() && memoLooksQuestionSpecific(data.memo ?? "")) {
    issues.push({
      id: "question-note-in-global-memo",
      severity: "warning",
      message: "문제별 메모가 전체 메모에 들어간 것 같습니다. 답안지의 문제별 메모 위치를 확인하세요.",
    });
  }

  const difficultyValues = (data.answerKey ?? [])
    .map((item) => item.difficulty)
    .filter((value): value is NonNullable<typeof value> =>
      value === "low" || value === "medium" || value === "high",
    );
  if (
    (data.answerKey ?? []).length >= 3 &&
    difficultyValues.length >= 3 &&
    new Set(difficultyValues).size === 1
  ) {
    issues.push({
      id: "uniform-answer-difficulty",
      severity: "warning",
      message: "문항 난이도가 모두 동일합니다. GPT가 난이도를 일괄 입력했는지 확인하세요.",
    });
  }

  if (questionNumbers.length === 0 && (data.question ?? "").trim()) {
    issues.push({
      id: "no-question-numbers",
      severity: "info",
      message: "본문에서 문제 번호를 찾지 못했습니다. 자유 텍스트로 저장됩니다.",
    });
  }

  return { questionNumbers, answerNumbers, issues, audit };
}
