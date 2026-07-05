import type { LearningBlock, SheetAnswerItem, WrongAnswerEntry } from "../types";
import { getEntryTitle } from "./entry";
import { normalizeQuestionNumber } from "./questionMeta";
import { parseQuestionText, type QuestionBlock } from "./textLayout";

export type GptExportRangeMode =
  | "current"
  | "manual-range"
  | "important-only"
  | "whole-sheet"
  | "whole-group";

export type GptExportFormat = "prompt" | "markdown" | "json";

export interface GptExportOptions {
  entry: WrongAnswerEntry;
  allEntries: WrongAnswerEntry[];
  currentQuestionNumber?: string;
  rangeMode: GptExportRangeMode;
  manualRange: string;
  format: GptExportFormat;
  includeQuestion: boolean;
  includeChoices: boolean;
  includeFigures: boolean;
  includeAnswers: boolean;
  includeExplanations: boolean;
  includeWrongPoints: boolean;
  includeLearning: boolean;
}

export function parseQuestionSelectionRange(input: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const rawPart of input.split(/[,\s]+/)) {
    const part = rawPart.trim();
    if (!part) continue;
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) continue;
      for (let value = start; value <= end; value += 1) {
        const normalized = normalizeQuestionNumber(value);
        if (!seen.has(normalized)) {
          seen.add(normalized);
          result.push(normalized);
        }
      }
      continue;
    }
    const normalized = normalizeQuestionNumber(part);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function questionKey(block: QuestionBlock): string[] {
  return [
    normalizeQuestionNumber(block.displayNumber),
    normalizeQuestionNumber(block.numberLabel),
  ].filter(Boolean);
}

function answerForQuestion(entry: WrongAnswerEntry, block: QuestionBlock): SheetAnswerItem | undefined {
  const keys = new Set(questionKey(block));
  return (entry.answerKey ?? []).find((item) =>
    keys.has(normalizeQuestionNumber(item.questionNumber)),
  );
}

function selectedBlocksForEntry(
  entry: WrongAnswerEntry,
  options: Pick<GptExportOptions, "rangeMode" | "manualRange" | "currentQuestionNumber">,
): QuestionBlock[] {
  const blocks = parseQuestionText(entry.question).filter(
    (block): block is QuestionBlock => block.kind === "question",
  );
  if (!blocks.length) return [];

  if (options.rangeMode === "whole-sheet" || options.rangeMode === "whole-group") {
    return blocks;
  }

  if (options.rangeMode === "important-only") {
    const important = new Set(
      (entry.questionMeta ?? [])
        .filter((meta) => meta.important)
        .map((meta) => normalizeQuestionNumber(meta.questionNumber)),
    );
    return blocks.filter((block) => questionKey(block).some((key) => important.has(key)));
  }

  const wanted =
    options.rangeMode === "current"
      ? [normalizeQuestionNumber(options.currentQuestionNumber)]
      : parseQuestionSelectionRange(options.manualRange);
  const wantedSet = new Set(wanted.filter(Boolean));
  return blocks.filter((block) => questionKey(block).some((key) => wantedSet.has(key)));
}

export function getGptExportEntries(options: GptExportOptions): WrongAnswerEntry[] {
  if (options.rangeMode !== "whole-group" || !options.entry.sheetGroup) return [options.entry];
  const groupId = options.entry.sheetGroup.groupId;
  return options.allEntries
    .filter(
      (entry) =>
        entry.entryKind === "problem_sheet" &&
        entry.sheetGroup?.groupId === groupId,
    )
    .sort((a, b) => (a.sheetGroup?.partOrder ?? 0) - (b.sheetGroup?.partOrder ?? 0));
}

function figuresForQuestion(entry: WrongAnswerEntry, block: QuestionBlock): string[] {
  const keys = new Set(questionKey(block));
  return (entry.figures ?? [])
    .filter((figure) => keys.has(normalizeQuestionNumber(figure.questionNumber)))
    .map((figure) =>
      [
        figure.title || "도표/이미지",
        figure.caption,
        figure.image ? `파일: ${figure.image}` : "",
        figure.source ? `source: ${figure.source}` : "",
        figure.needsReview ? "검토 필요" : "",
      ]
        .filter(Boolean)
        .join(" · "),
    );
}

function learningLines(blocks: LearningBlock[] | undefined): string[] {
  return (blocks ?? [])
    .slice(0, 12)
    .map((block) => `- ${block.title}: ${block.content}`.trim())
    .filter((line) => line.length > 4);
}

function exportQuestionMarkdown(entry: WrongAnswerEntry, block: QuestionBlock, options: GptExportOptions): string {
  const answer = answerForQuestion(entry, block);
  const lines = [`## ${getEntryTitle(entry)} / 문제 ${block.displayNumber}`];
  if (entry.sheetGroup) {
    lines.push(`묶음: ${entry.sheetGroup.groupTitle} / ${entry.sheetGroup.partTitle}`);
  }
  if (options.includeQuestion) lines.push("", block.body.trim() || "(본문 없음)");
  if (options.includeChoices && block.choices.length) {
    lines.push("", "### 선지");
    for (const choice of block.choices) lines.push(`- ${choice.marker} ${choice.text}`);
  }
  if (options.includeFigures) {
    const figures = figuresForQuestion(entry, block);
    if (figures.length) lines.push("", "### 도표/이미지 설명", ...figures.map((item) => `- ${item}`));
  }
  if (answer && options.includeAnswers) lines.push("", `정답: ${answer.answer || "(없음)"}`);
  if (answer && options.includeExplanations && answer.explanation) {
    lines.push("", "### 기존 해설", answer.explanation);
  }
  if (answer && options.includeWrongPoints) {
    const wrongPoints = [answer.wrongPoint, ...(answer.importantPoints ?? [])].filter(Boolean);
    if (wrongPoints.length) lines.push("", "### 오답 포인트", ...wrongPoints.map((point) => `- ${point}`));
  }
  return lines.join("\n");
}

export function buildGptExportPayload(options: GptExportOptions): string {
  const entries = getGptExportEntries(options);
  const payload = entries.flatMap((entry) =>
    selectedBlocksForEntry(entry, options).map((block) => ({
      entry,
      block,
      answer: answerForQuestion(entry, block),
      figures: figuresForQuestion(entry, block),
    })),
  );

  if (options.format === "json") {
    return JSON.stringify(
      {
        instruction:
          "다음 문제를 수능식으로 풀고, 각 문제마다 정답, 풀이 전략, 단계별 풀이, 오답 포인트, 복습 포인트를 정리해줘.",
        questions: payload.map(({ entry, block, answer, figures }) => ({
          sheetTitle: getEntryTitle(entry),
          group: entry.sheetGroup,
          questionNumber: String(block.displayNumber),
          originalNumber: block.numberLabel,
          body: options.includeQuestion ? block.body : undefined,
          choices: options.includeChoices ? block.choices : undefined,
          figures: options.includeFigures ? figures : undefined,
          answer: options.includeAnswers ? answer?.answer : undefined,
          explanation: options.includeExplanations ? answer?.explanation : undefined,
          wrongPoints: options.includeWrongPoints
            ? [answer?.wrongPoint, ...(answer?.importantPoints ?? [])].filter(Boolean)
            : undefined,
        })),
        learningBlocks: options.includeLearning
          ? entries.flatMap((entry) => entry.learningBlocks ?? [])
          : undefined,
      },
      null,
      2,
    );
  }

  const body = payload
    .map(({ entry, block }) => exportQuestionMarkdown(entry, block, options))
    .join("\n\n---\n\n");
  const learning = options.includeLearning
    ? entries.flatMap((entry) => learningLines(entry.learningBlocks))
    : [];

  if (options.format === "markdown") {
    return [body, learning.length ? ["# 특강/학습 내용", ...learning].join("\n") : ""]
      .filter(Boolean)
      .join("\n\n");
  }

  return [
    "다음 문제를 수능식으로 풀어줘. 각 문제마다 정답, 풀이 전략, 단계별 풀이, 오답 포인트, 복습 포인트를 정리해줘.",
    "학생 필기나 추측은 섞지 말고, 문제 원문과 제공된 정보만 기준으로 답해줘.",
    "",
    body || "(선택된 문제가 없습니다.)",
    learning.length ? ["", "참고할 특강/학습 내용:", ...learning].join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n");
}
