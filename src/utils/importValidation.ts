import type { EntryFormData, ImportAudit } from "../types";
import { parseQuestionText } from "./textLayout";
import { getEntryQuestions } from "./entryQuestions";
import { normalizeImportAudit, normalizeRejectedNotes } from "./importAudit";
import { normalizeQuestionNumber } from "./questionMeta";

export type ImportValidationSeverity = "info" | "warning" | "error";

export interface ImportValidationIssue {
  id: string;
  severity: ImportValidationSeverity;
  message: string;
  autoFixAvailable?: "describe-only" | "remove-figure" | "connect-later";
}

export interface ImportValidationReport {
  questionNumbers: string[];
  answerNumbers: string[];
  issues: ImportValidationIssue[];
  audit?: ImportAudit;
}

export interface ImportValidationClassification {
  blocking: ImportValidationIssue[];
  confirmable: ImportValidationIssue[];
  other: ImportValidationIssue[];
}

export function classifyImportValidationIssues(report: ImportValidationReport): ImportValidationClassification {
  const blocking: ImportValidationIssue[] = [];
  const confirmable: ImportValidationIssue[] = [];
  const other: ImportValidationIssue[] = [];

  for (const issue of report.issues) {
    if (issue.id.startsWith("audit-missing-question-")) {
      blocking.push(issue);
    } else if (
      issue.id === "audit-handwriting-not-excluded" ||
      issue.id === "rejected-note-possible-leak" ||
      issue.id.startsWith("unlinked-figure-")
    ) {
      confirmable.push(issue);
    } else {
      other.push(issue);
    }
  }

  return { blocking, confirmable, other };
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

function questionLabel(value: string): string {
  return /^\d+$/.test(value) ? `${value}번` : value;
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

function hasDiagramForQuestion(data: Partial<EntryFormData>, questionNumber: string): boolean {
  const normalized = normalizeQuestionNumber(questionNumber);
  if (!normalized) return false;
  return Boolean(
    (data.answerKey ?? []).some((item) =>
      normalizeQuestionNumber(item.questionNumber) === normalized && Boolean(item.diagramSpec || item.diagramType),
    ) ||
      (data.learningBlocks ?? []).some((block) =>
        normalizeQuestionNumber(block.sourceQuestionNumber) === normalized && Boolean(block.diagramSpec || block.diagramType),
      ),
  );
}

export function getQuestionNumbers(question: string): string[] {
  return parseQuestionText(question)
    .filter((block) => block.kind === "question")
    .map((block) => normalizeQuestionNumber(block.displayNumber))
    .filter(Boolean);
}

export function validateImportedStudyData(data: Partial<EntryFormData>): ImportValidationReport {
  const questionBlocks = parseQuestionText(data.question ?? "").filter((block) => block.kind === "question");
  const resolvedQuestions = getEntryQuestions({
    question: data.question ?? "",
    structuredQuestions: data.structuredQuestions,
    questionContentSegments: data.questionContentSegments,
  });
  const questionNumbers = data.structuredQuestions?.length
    ? resolvedQuestions.map((block) => normalizeQuestionNumber(block.questionNumber))
    : questionBlocks.map((block) => normalizeQuestionNumber(block.displayNumber));
  const connectableQuestionNumbers = data.structuredQuestions?.length
    ? questionNumbers
    : questionBlocks.flatMap((block) => [normalizeQuestionNumber(block.displayNumber), normalizeQuestionNumber(block.numberLabel)]);
  const answerNumbers = (data.answerKey ?? [])
    .map((item) => normalizeQuestionNumber(item.questionNumber))
    .filter(Boolean);
  const questionNumberSet = new Set(connectableQuestionNumbers);
  const answerNumberSet = new Set(answerNumbers);
  const issues: ImportValidationIssue[] = [];
  const audit = data.importAudit
    ? normalizeImportAudit(data.importAudit, data)
    : undefined;
  const rejectedNotes = normalizeRejectedNotes(data.rejectedNotes);

  for (const number of audit?.missingQuestionNumbers ?? []) {
    issues.push({
      id: `audit-missing-question-${number}`,
      severity: "error",
      message: `${questionLabel(number)} 문제가 이미지에서 예상됐지만 본문에 감지되지 않았습니다.`,
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
        item.strategy ?? "",
        ...(item.steps ?? []),
        ...(item.choiceJudgements ?? []).map((judgement) => judgement.text),
        item.wrongPoint ?? "",
        item.reviewPoint ?? "",
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
      const hasDescription = Boolean(figure.caption.trim());
      const hasDiagramSpec = hasDiagramForQuestion(data, figure.questionNumber);
      if (figure.source === "described_only" && (hasDescription || hasDiagramSpec)) {
        issues.push({
          id: `described-figure-${figure.id || index}`,
          severity: hasDiagramSpec ? "info" : "warning",
          message: `${figure.questionNumber || "번호 미상"} 도표/그림은 이미지 없이 설명 도표로 저장됩니다.`,
        });
        continue;
      }
      issues.push({
        id: `unlinked-figure-${figure.id || index}`,
        severity: "warning",
        message: `${figure.questionNumber || "번호 미상"} 도표/그림에 연결된 이미지가 없습니다. 설명 도표로 유지하거나, 도표 항목 제외 또는 나중에 이미지 연결을 선택할 수 있습니다.`,
        autoFixAvailable: "describe-only",
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

  const missingQuestionEntries = data.structuredQuestions?.length
    ? resolvedQuestions.map((block) => ({ displayNumber: block.questionNumber, sourceNumber: block.questionNumber }))
    : questionBlocks.map((block) => ({ displayNumber: normalizeQuestionNumber(block.displayNumber), sourceNumber: normalizeQuestionNumber(block.numberLabel) }));
  for (const { displayNumber, sourceNumber } of missingQuestionEntries) {
    if (!answerNumberSet.has(displayNumber) && !answerNumberSet.has(sourceNumber)) {
      issues.push({
        id: `missing-answer-${displayNumber}`,
        severity: "warning",
        message: `${displayNumber}번 문제에 연결된 답안이 없습니다.`,
      });
    }
  }

  for (const number of answerNumbers) {
    if (!questionNumberSet.has(normalizeQuestionNumber(number))) {
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

  for (const block of questionBlocks) {
    const number = normalizeQuestionNumber(block.numberLabel) || String(block.displayNumber);
    if (/^\s*(?:정답|답|해설)\s*[:：]/m.test(block.body)) {
      issues.push({ id: `answer-leak-question-${number}`, severity: "warning", message: `${number}번 문제 본문에 정답 또는 해설로 의심되는 문장이 포함되어 있습니다.` });
    }
    if (block.choices.some((choice) => /(?:정답|해설|따라서|그러므로)\s*[:：]/.test(choice.text))) {
      issues.push({ id: `answer-leak-choice-${number}`, severity: "warning", message: `${number}번 선택지에 해설 문장으로 의심되는 내용이 포함되어 있습니다.` });
    }
  }

  for (const figure of data.figures ?? []) {
    if (figure.source === "described_only" && figure.image) {
      issues.push({ id: `described-image-${figure.id}`, severity: "warning", message: `${figure.questionNumber || "번호 미상"}번 설명 도표에 실제 이미지 파일이 연결되어 있습니다.` });
    }
    if (/(?:정답|답)\s*[:：]/.test(figure.caption)) {
      issues.push({ id: `answer-leak-figure-${figure.id}`, severity: "warning", message: `${figure.questionNumber || "번호 미상"}번 그림 설명에 정답으로 의심되는 문장이 포함되어 있습니다.` });
    }
    const placement = figure.placement;
    if (placement && normalizeQuestionNumber(placement.questionNumber) !== normalizeQuestionNumber(figure.questionNumber)) {
      issues.push({ id: `figure-placement-${figure.id}`, severity: "warning", message: `${figure.questionNumber || "번호 미상"}번 그림의 위치 정보가 문항 번호와 일치하지 않습니다.` });
    }
  }

  const segments = data.questionContentSegments ?? {};
  for (const [number, items] of Object.entries(segments)) {
    const figures = new Set((data.figures ?? []).filter((figure) => normalizeQuestionNumber(figure.questionNumber) === normalizeQuestionNumber(number)).map((figure) => figure.id));
    for (const segment of items) {
      if (segment.type === "figure" && !figures.has(segment.figureId)) {
        issues.push({ id: `segment-figure-${number}-${segment.id}`, severity: "warning", message: `${number}번 그림 위치가 실제 그림 항목과 연결되지 않았습니다.` });
      }
    }
  }

  return { questionNumbers, answerNumbers, issues, audit };
}
