import type { ExamSession, WrongAnswerEntry } from "../../../types";
import type { ExportScopeMode } from "../../../types";
import { parseQuestionSelectionRange } from "../../../utils/gptExport";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";
import { parseQuestionText } from "../../../utils/textLayout";

export interface ResolveExportQuestionNumbersInput {
  entry: WrongAnswerEntry;
  scope: ExportScopeMode;
  selectedNumbers?: string[];
  currentQuestionNumber?: string | null;
  manualInput?: string;
  examSession?: ExamSession | null;
}

export interface ResolveExportQuestionNumbersResult {
  questionNumbers: string[];
  disabledReason?: string;
  invalidNumbers?: string[];
}

function sheetOrder(entry: WrongAnswerEntry): string[] {
  return parseQuestionText(entry.question)
    .filter((block): block is Extract<ReturnType<typeof parseQuestionText>[number], { kind: "question" }> => block.kind === "question")
    .map((block) => normalizeQuestionNumber(String(block.displayNumber || block.numberLabel || "")))
    .filter(Boolean);
}

function uniquePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeQuestionNumber(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
function wrongNumbers(session: ExamSession): string[] {
  const scored = session.score?.questionResults
    ?.filter((item) => item.hasResponse && !item.correct)
    .map((item) => item.questionNumber);
  if (scored && scored.length > 0) return uniquePreserveOrder(scored);

  return uniquePreserveOrder(
    session.responses
      .filter((item) => item.response.trim().length > 0)
      .filter((item) => {
        const question = session.questions.find(
          (candidate) => normalizeQuestionNumber(candidate.questionNumber) === normalizeQuestionNumber(item.questionNumber),
        );
        if (!question?.correctAnswer) return false;
        return question.correctAnswer.trim() !== item.response.trim();
      })
      .map((item) => item.questionNumber),
  );
}

function markedNumbers(session: ExamSession): string[] {
  const scored = session.score?.questionResults
    ?.filter((item) => item.markedForReview)
    .map((item) => item.questionNumber);
  if (scored && scored.length > 0) return uniquePreserveOrder(scored);
  return uniquePreserveOrder(
    session.responses.filter((item) => item.markedForReview).map((item) => item.questionNumber),
  );
}

export function resolveExportQuestionNumbers(
  input: ResolveExportQuestionNumbersInput,
): ResolveExportQuestionNumbersResult {
  const order = sheetOrder(input.entry);
  const orderSet = new Set(order);

  const inSheetOrder = (numbers: string[]) => {
    const wanted = new Set(numbers.map((value) => normalizeQuestionNumber(value)).filter(Boolean));
    return order.filter((number) => wanted.has(number));
  };
  switch (input.scope) {
    case "current": {
      const current = normalizeQuestionNumber(input.currentQuestionNumber ?? "");
      if (!current) return { questionNumbers: [], disabledReason: "현재 문항이 선택되지 않았습니다." };
      if (order.length > 0 && !orderSet.has(current)) return { questionNumbers: [], disabledReason: current + "번은 이 시험지에 없습니다.", invalidNumbers: [current] };
      return { questionNumbers: [current] };
    }
    case "selected": {
      const selected = uniquePreserveOrder(input.selectedNumbers ?? []);
      if (selected.length === 0) return { questionNumbers: [], disabledReason: "선택한 문항이 없습니다." };
      const invalid = selected.filter((number) => order.length > 0 && !orderSet.has(number));
      const valid = inSheetOrder(selected);
      if (valid.length === 0) return { questionNumbers: [], disabledReason: "선택한 문항이 시험지에서 확인되지 않습니다.", invalidNumbers: invalid };
      return { questionNumbers: valid, invalidNumbers: invalid.length ? invalid : undefined };
    }
    case "wrong": {
      if (!input.examSession || input.examSession.entryId !== input.entry.id) return { questionNumbers: [], disabledReason: "틀린 문항은 연결된 시험 세션이 있을 때만 사용할 수 있습니다." };
      if (input.examSession.status !== "submitted") return { questionNumbers: [], disabledReason: "틀린 문항은 시험 제출 후에 선택할 수 있습니다." };
      const numbers = inSheetOrder(wrongNumbers(input.examSession));
      if (numbers.length === 0) return { questionNumbers: [], disabledReason: "틀린 문항이 없습니다." };
      return { questionNumbers: numbers };
    }
    case "important": {
      const numbers = inSheetOrder((input.entry.questionMeta ?? []).filter((item) => item.important).map((item) => item.questionNumber));
      if (numbers.length === 0) return { questionNumbers: [], disabledReason: "중요 표시된 문항이 없습니다." };
      return { questionNumbers: numbers };
    }
    case "marked": {
      if (!input.examSession || input.examSession.entryId !== input.entry.id) return { questionNumbers: [], disabledReason: "검토 표시 문항은 연결된 시험 세션이 있을 때만 사용할 수 있습니다." };
      const numbers = inSheetOrder(markedNumbers(input.examSession));
      if (numbers.length === 0) return { questionNumbers: [], disabledReason: "검토 표시된 문항이 없습니다." };
      return { questionNumbers: numbers };
    }
    case "manual": {
      const parsed = uniquePreserveOrder(parseQuestionSelectionRange(input.manualInput ?? ""));
      if (parsed.length === 0) return { questionNumbers: [], disabledReason: "문항 번호 형식을 확인해 주세요. 예: 1-5, 8, 10-14" };
      const invalid = parsed.filter((number) => order.length > 0 && !orderSet.has(number));
      const valid = inSheetOrder(parsed);
      if (valid.length === 0) return { questionNumbers: [], disabledReason: "입력한 문항 번호가 시험지에 없습니다.", invalidNumbers: invalid };
      return { questionNumbers: valid, invalidNumbers: invalid.length ? invalid : undefined };
    }
    case "whole":
    default: {
      if (order.length === 0) return { questionNumbers: [], disabledReason: "시험지에서 문항을 찾지 못했습니다." };
      return { questionNumbers: order };
    }
  }
}
