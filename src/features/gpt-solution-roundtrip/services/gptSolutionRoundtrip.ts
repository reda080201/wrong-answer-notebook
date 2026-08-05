import { v4 as uuidv4 } from "uuid";
import type { LearningBlock, LearningBlockType } from "../../../models/learning";
import type { SheetAnswerItem, WrongAnswerEntry } from "../../../models/entry";
import { normalizeQuestionNumber } from "../../../utils/questionNumber";
import type {
  GptSolution,
  GptSolutionApplyResult,
  GptSolutionDiffRow,
  GptSolutionField,
  GptSolutionFieldDiff,
  GptSolutionFieldResolution,
  GptSolutionLearningBlock,
  GptSolutionMergeAnalysis,
  GptSolutionResolution,
  GptSolutionResponse,
  GptSolutionValidationOptions,
  GptSolutionValidationResult,
} from "../model";

const SOLUTION_FIELDS: GptSolutionField[] = [
  "answer",
  "strategy",
  "steps",
  "explanation",
  "concepts",
  "wrongPoint",
  "reviewPoint",
];

const LEARNING_BLOCK_TYPES = new Set<LearningBlockType>([
  "concept",
  "formula",
  "routine",
  "warning",
  "review",
  "checklist",
  "diagram",
]);

type UnknownRecord = Record<string, unknown>;

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
}

function hasMeaningfulValue(value: unknown): boolean {
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null;
}

function equalValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function label(number: string): string {
  return /^\d+$/.test(number) ? `${number}번` : number;
}

function uniqueNormalized(values: readonly string[]): { values: string[]; duplicates: string[] } {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const number = normalizeQuestionNumber(value);
    if (!number) continue;
    if (seen.has(number)) duplicates.add(number);
    else {
      seen.add(number);
      normalized.push(number);
    }
  }
  return { values: normalized, duplicates: [...duplicates] };
}

function parseLearningBlocks(
  raw: unknown,
  questionNumber: string,
  warnings: string[],
): GptSolutionLearningBlock[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    warnings.push(`${label(questionNumber)} 학습 블록 형식이 배열이 아니어서 제외했습니다.`);
    return [];
  }

  const blocks: GptSolutionLearningBlock[] = [];
  raw.forEach((value, index) => {
    const item = asRecord(value);
    const type = item?.type;
    const title = text(item?.title);
    const content = text(item?.content);
    if (typeof type !== "string" || !LEARNING_BLOCK_TYPES.has(type as LearningBlockType) || !title || !content) {
      warnings.push(`${label(questionNumber)} 학습 블록 ${index + 1}개는 type, title, content가 유효하지 않아 제외했습니다.`);
      return;
    }
    blocks.push({
      type: type as LearningBlockType,
      title,
      content,
      sourceQuestionNumber: questionNumber,
    });
  });
  return blocks;
}

function parseSolution(raw: unknown, warnings: string[], index: number): GptSolution | undefined {
  const item = asRecord(raw);
  const questionNumber = normalizeQuestionNumber(item?.questionNumber as string | number | undefined);
  if (!item || !questionNumber) {
    warnings.push(`응답 해설 ${index + 1}개에 유효한 문항 번호가 없어 제외했습니다.`);
    return undefined;
  }
  const result: GptSolution = {
    questionNumber,
    answer: text(item.answer),
    strategy: text(item.strategy),
    steps: stringArray(item.steps),
    explanation: text(item.explanation),
    concepts: stringArray(item.concepts),
    wrongPoint: text(item.wrongPoint),
    reviewPoint: text(item.reviewPoint),
    learningBlocks: parseLearningBlocks(item.learningBlocks, questionNumber, warnings),
  };
  const hasContent = SOLUTION_FIELDS.some((field) => hasMeaningfulValue(result[field]))
    || result.learningBlocks.length > 0;
  if (!hasContent) {
    warnings.push(`${label(questionNumber)} 해설에 저장할 내용이 없어 제외했습니다.`);
    return undefined;
  }
  return result;
}

/**
 * Parses the intentionally narrow GPT response contract. It never makes an
 * unrequested answer applicable, even when the response itself includes it.
 */
export function validateGptSolutionResponse(
  raw: unknown,
  options: GptSolutionValidationOptions,
): GptSolutionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const discardedQuestionNumbers: string[] = [];
  const payload = asRecord(raw);
  if (!payload) {
    return { valid: false, errors: ["GPT 응답은 JSON 객체여야 합니다."], warnings, discardedQuestionNumbers };
  }

  const entryId = text(payload.entryId);
  if (!entryId) errors.push("GPT 응답에 entryId가 없습니다.");
  else if (entryId !== options.entryId) errors.push("GPT 응답의 entryId가 현재 문제지와 다릅니다.");

  const rawQuestionNumbers = payload.questionNumbers;
  if (!Array.isArray(rawQuestionNumbers) || !rawQuestionNumbers.every((value) => typeof value === "string" || typeof value === "number")) {
    errors.push("GPT 응답의 questionNumbers는 문항 번호 배열이어야 합니다.");
  }
  const reported = uniqueNormalized(
    Array.isArray(rawQuestionNumbers)
      ? rawQuestionNumbers.filter((value): value is string | number => typeof value === "string" || typeof value === "number").map(String)
      : [],
  );
  if (reported.values.length === 0) errors.push("GPT 응답의 questionNumbers에 유효한 문항 번호가 없습니다.");
  if (reported.duplicates.length) errors.push(`GPT 응답의 문항 번호가 중복됩니다: ${reported.duplicates.map(label).join(", ")}`);

  const requested = uniqueNormalized(options.requestedQuestionNumbers);
  if (requested.duplicates.length) errors.push(`선택 snapshot의 문항 번호가 중복됩니다: ${requested.duplicates.map(label).join(", ")}`);
  const requestedSet = new Set(requested.values);
  const availableSet = options.availableQuestionNumbers
    ? new Set(uniqueNormalized(options.availableQuestionNumbers).values)
    : undefined;

  for (const number of reported.values) {
    if (!requestedSet.has(number)) {
      warnings.push(`${label(number)} 결과는 요청하지 않은 문항이라 폐기합니다.`);
      discardedQuestionNumbers.push(number);
    }
  }

  if (!Array.isArray(payload.solutions)) {
    errors.push("GPT 응답의 solutions는 배열이어야 합니다.");
    return { valid: false, errors, warnings, discardedQuestionNumbers };
  }

  const parsed = payload.solutions
    .map((solution, index) => parseSolution(solution, warnings, index))
    .filter((solution): solution is GptSolution => Boolean(solution));
  const solutionNumbers = uniqueNormalized(parsed.map((solution) => solution.questionNumber));
  if (solutionNumbers.duplicates.length) errors.push(`GPT 응답의 solutions 문항 번호가 중복됩니다: ${solutionNumbers.duplicates.map(label).join(", ")}`);

  const acceptedSolutions = parsed.filter((solution) => {
    if (!reported.values.includes(solution.questionNumber)) {
      warnings.push(`${label(solution.questionNumber)} 해설은 questionNumbers에 선언되지 않아 폐기합니다.`);
      discardedQuestionNumbers.push(solution.questionNumber);
      return false;
    }
    if (!requestedSet.has(solution.questionNumber)) {
      warnings.push(`${label(solution.questionNumber)} 해설은 요청하지 않은 문항이라 폐기합니다.`);
      discardedQuestionNumbers.push(solution.questionNumber);
      return false;
    }
    if (availableSet && !availableSet.has(solution.questionNumber)) {
      warnings.push(`${label(solution.questionNumber)} 해설은 현재 문제지에 없는 문항이라 폐기합니다.`);
      discardedQuestionNumbers.push(solution.questionNumber);
      return false;
    }
    return true;
  });

  for (const number of requested.values) {
    if (!acceptedSolutions.some((solution) => solution.questionNumber === number)) {
      warnings.push(`${label(number)}에 대한 GPT 해설이 반환되지 않았습니다.`);
    }
  }

  return {
    valid: errors.length === 0,
    response: errors.length === 0 && entryId
      ? { entryId, questionNumbers: reported.values.filter((number) => requestedSet.has(number)), solutions: acceptedSolutions }
      : undefined,
    errors,
    warnings,
    discardedQuestionNumbers: [...new Set(discardedQuestionNumbers)],
  };
}

function answerMap(entry: WrongAnswerEntry): Map<string, SheetAnswerItem> {
  const result = new Map<string, SheetAnswerItem>();
  for (const item of entry.answerKey ?? []) {
    const number = normalizeQuestionNumber(item.questionNumber);
    if (number && !result.has(number)) result.set(number, item);
  }
  return result;
}

function learningBlockKey(block: Pick<LearningBlock, "sourceQuestionNumber" | "type" | "title">): string {
  return [
    normalizeQuestionNumber(block.sourceQuestionNumber),
    block.type,
    block.title.trim().toLocaleLowerCase("ko-KR"),
  ].join("\u0000");
}

function fieldDiff(
  existing: SheetAnswerItem | undefined,
  incoming: GptSolution,
  field: GptSolutionField,
): GptSolutionFieldDiff | undefined {
  const next = incoming[field];
  if (!hasMeaningfulValue(next)) return undefined;
  const current = existing?.[field];
  if (!existing) return { field, existing: undefined, incoming: clone(next), status: "new", defaultResolution: "incoming" };
  if (!hasMeaningfulValue(current)) return { field, existing: clone(current), incoming: clone(next), status: "fill", defaultResolution: "fill" };
  if (equalValue(current, next)) return { field, existing: clone(current), incoming: clone(next), status: "unchanged", defaultResolution: "existing" };
  return { field, existing: clone(current), incoming: clone(next), status: "conflict", defaultResolution: "existing" };
}

export function analyzeGptSolutionRoundtrip(
  entry: WrongAnswerEntry,
  response: GptSolutionResponse,
  requestedQuestionNumbers: readonly string[],
): GptSolutionMergeAnalysis {
  const requested = uniqueNormalized(requestedQuestionNumbers).values;
  const existingAnswers = answerMap(entry);
  const existingBlocks = new Set((entry.learningBlocks ?? []).map(learningBlockKey));
  const warnings: string[] = [];
  const rows: GptSolutionDiffRow[] = response.solutions.map((incoming) => {
    const questionNumber = normalizeQuestionNumber(incoming.questionNumber);
    const existing = existingAnswers.get(questionNumber);
    const learningBlocks = incoming.learningBlocks.map((block) => {
      const key = learningBlockKey(block);
      const duplicate = existingBlocks.has(key);
      if (!duplicate) existingBlocks.add(key);
      return { block: clone(block), status: duplicate ? "duplicate" as const : "append" as const };
    });
    return {
      questionNumber,
      existing: existing ? clone(existing) : undefined,
      incoming: clone(incoming),
      fields: SOLUTION_FIELDS.flatMap((field) => {
        const diff = fieldDiff(existing, incoming, field);
        return diff ? [diff] : [];
      }),
      learningBlocks,
    };
  });
  for (const number of requested) {
    if (!rows.some((row) => row.questionNumber === number)) warnings.push(`${label(number)}은 검토할 GPT 해설이 없습니다.`);
  }
  return { entryId: response.entryId, requestedQuestionNumbers: requested, rows, warnings };
}

function selectedFieldValue(
  current: unknown,
  incoming: unknown,
  resolution: GptSolutionFieldResolution,
): unknown {
  if (resolution === "existing") return clone(current);
  if (resolution === "incoming") return hasMeaningfulValue(incoming) ? clone(incoming) : clone(current);
  return hasMeaningfulValue(current) ? clone(current) : clone(incoming);
}

function hasAnyAppliedField(row: GptSolutionDiffRow, resolution: GptSolutionResolution | undefined): boolean {
  return row.fields.some((field) => {
    const selected = resolution?.fields?.[field.field] ?? field.defaultResolution;
    const value = selectedFieldValue(field.existing, field.incoming, selected);
    return hasMeaningfulValue(value);
  });
}

function mergeAnswer(
  existing: SheetAnswerItem | undefined,
  row: GptSolutionDiffRow,
  resolution: GptSolutionResolution | undefined,
  idFactory: () => string,
): SheetAnswerItem | undefined {
  if (!hasAnyAppliedField(row, resolution)) return existing ? clone(existing) : undefined;
  const next = existing
    ? clone(existing) as SheetAnswerItem & Record<string, unknown>
    : { id: idFactory(), questionNumber: row.questionNumber, answer: "", explanation: "", importantPoints: [] } as SheetAnswerItem & Record<string, unknown>;
  for (const field of row.fields) {
    const selected = resolution?.fields?.[field.field] ?? field.defaultResolution;
    const value = selectedFieldValue(field.existing, field.incoming, selected);
    if (value !== undefined) (next as Record<string, unknown>)[field.field] = value;
  }
  if (existing) {
    next.id = existing.id;
    next.questionNumber = existing.questionNumber;
  }
  return next;
}

/** Applies only explicitly approved rows and preserves all existing answer object fields. */
export function applyGptSolutionRoundtrip(
  entry: WrongAnswerEntry,
  analysis: GptSolutionMergeAnalysis,
  resolutions: readonly GptSolutionResolution[],
  idFactory: () => string = uuidv4,
): GptSolutionApplyResult<WrongAnswerEntry> {
  if (analysis.entryId !== entry.id) throw new Error("현재 문제지와 GPT 해설 검토 대상이 다릅니다.");
  const resolutionByNumber = new Map(
    resolutions.map((resolution) => [normalizeQuestionNumber(resolution.questionNumber), resolution]),
  );
  const answerKey = (entry.answerKey ?? []).map(clone);
  const learningBlocks = (entry.learningBlocks ?? []).map(clone);
  const learningKeys = new Set(learningBlocks.map(learningBlockKey));
  const appliedQuestionNumbers: string[] = [];
  const appendedLearningBlockIds: string[] = [];

  for (const row of analysis.rows) {
    const resolution = resolutionByNumber.get(row.questionNumber);
    if (!resolution?.approved) continue;
    const answerIndex = answerKey.findIndex(
      (item) => normalizeQuestionNumber(item.questionNumber) === row.questionNumber,
    );
    const merged = mergeAnswer(answerIndex >= 0 ? answerKey[answerIndex] : undefined, row, resolution, idFactory);
    if (merged && answerIndex >= 0) answerKey[answerIndex] = merged;
    else if (merged) answerKey.push(merged);

    if (resolution.includeLearningBlocks !== false) {
      for (const candidate of row.learningBlocks) {
        if (candidate.status === "duplicate") continue;
        const block: LearningBlock = {
          id: idFactory(),
          type: candidate.block.type,
          title: candidate.block.title,
          content: candidate.block.content,
          sourceQuestionNumber: row.questionNumber,
        };
        const key = learningBlockKey(block);
        if (!learningKeys.has(key)) {
          learningBlocks.push(block);
          learningKeys.add(key);
          appendedLearningBlockIds.push(block.id);
        }
      }
    }
    appliedQuestionNumbers.push(row.questionNumber);
  }

  return {
    entry: {
      ...clone(entry),
      answerKey,
      learningBlocks,
    },
    appliedQuestionNumbers,
    appendedLearningBlockIds,
  };
}
