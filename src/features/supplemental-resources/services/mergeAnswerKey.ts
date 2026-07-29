import { v4 as uuidv4 } from "uuid";
import type {
  EntryFormData,
  SheetAnswerItem,
  SupplementalAppliedField,
  SupplementalResource,
  WrongAnswerEntry,
} from "../../../types";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";
import { getQuestionNumbers } from "../../../utils/importValidation";

export type AnswerMergeStatus = "add" | "supplement" | "unchanged" | "conflict" | "unmatched" | "duplicate";
export type AnswerMergeChoice = "existing" | "incoming";

export type AnswerMergeField = Exclude<keyof SheetAnswerItem, "id" | "questionNumber">;

export interface AnswerMergeFieldConflict {
  field: AnswerMergeField;
  existing: unknown;
  incoming: unknown;
}

export interface AnswerMergeRow {
  key: string;
  questionNumber: string;
  existing?: SheetAnswerItem;
  incoming?: SheetAnswerItem;
  status: AnswerMergeStatus;
  fieldConflicts: AnswerMergeFieldConflict[];
}

export interface AnswerMergeResolution {
  key: string;
  excluded?: boolean;
  targetQuestionNumber?: string;
  useDuplicate?: boolean;
  fieldChoices?: Partial<Record<AnswerMergeField, AnswerMergeChoice>>;
}

export interface AnswerMergeAnalysis {
  rows: AnswerMergeRow[];
  blockingIssues: string[];
  warnings: string[];
}

export interface ApplyAnswerMergeOptions {
  allowedFields?: SupplementalAppliedField[];
  resource?: SupplementalResource;
  idFactory?: () => string;
}

export function getAnswerMergeResolutionIssues(
  existingEntry: WrongAnswerEntry,
  analysis: AnswerMergeAnalysis,
  resolutions: AnswerMergeResolution[],
): string[] {
  const resolutionMap = new Map(resolutions.map((item) => [item.key, item]));
  const targets = targetQuestionNumbers(existingEntry);
  const issues: string[] = [];

  for (const row of analysis.rows.filter((item) => item.status === "unmatched")) {
    const resolution = resolutionMap.get(row.key);
    if (resolution?.excluded) continue;
    const target = normalizeQuestionNumber(resolution?.targetQuestionNumber ?? "");
    if (!target || !targets.has(target)) {
      issues.push(`${row.questionNumber}번 자료를 연결할 기존 문항 번호를 지정하거나 제외해 주세요.`);
    }
  }

  const duplicateNumbers = new Set(
    analysis.rows.filter((row) => row.status === "duplicate").map((row) => row.questionNumber),
  );
  for (const number of duplicateNumbers) {
    const rows = analysis.rows.filter(
      (row) => row.status === "duplicate" && row.questionNumber === number,
    );
    const selected = rows.filter((row) => resolutionMap.get(row.key)?.useDuplicate);
    const allExcluded = rows.every((row) => resolutionMap.get(row.key)?.excluded);
    if (selected.length !== 1 && !allExcluded) {
      issues.push(`${number}번 중복 답안에서 사용할 항목 하나를 선택하거나 모두 제외해 주세요.`);
    }
  }

  return issues;
}

const ANSWER_FIELDS: AnswerMergeField[] = [
  "answer",
  "explanation",
  "strategy",
  "steps",
  "choiceJudgements",
  "wrongPoint",
  "reviewPoint",
  "notes",
  "mistakeAnalysis",
  "importantPoints",
  "difficulty",
  "difficultyScore",
  "concepts",
  "diagramType",
  "diagramSpec",
  "needsReview",
  "sourceNote",
];

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function meaningful(value: unknown): boolean {
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== false;
}

function equalValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function answerMap(entry: Pick<WrongAnswerEntry, "answerKey">): Map<string, SheetAnswerItem> {
  const result = new Map<string, SheetAnswerItem>();
  for (const item of entry.answerKey ?? []) {
    const number = normalizeQuestionNumber(item.questionNumber);
    if (number && !result.has(number)) result.set(number, item);
  }
  return result;
}

function targetQuestionNumbers(entry: WrongAnswerEntry): Set<string> {
  return new Set([
    ...getQuestionNumbers(entry.question),
    ...(entry.questionMeta ?? []).map((item) => normalizeQuestionNumber(item.questionNumber)),
    ...(entry.answerKey ?? []).map((item) => normalizeQuestionNumber(item.questionNumber)),
  ].filter(Boolean));
}

function normalizeIncoming(item: SheetAnswerItem): SheetAnswerItem {
  return {
    ...clone(item),
    id: item.id || uuidv4(),
    questionNumber: normalizeQuestionNumber(item.questionNumber),
    answer: item.answer ?? "",
    explanation: item.explanation ?? "",
    importantPoints: [...(item.importantPoints ?? [])],
  };
}

function fieldsForComparison(existing: SheetAnswerItem, incoming: SheetAnswerItem): AnswerMergeFieldConflict[] {
  return ANSWER_FIELDS.flatMap((field) => {
    const current = existing[field];
    const next = incoming[field];
    return meaningful(next) && meaningful(current) && !equalValue(current, next)
      ? [{ field, existing: clone(current), incoming: clone(next) }]
      : [];
  });
}

function hasSupplement(existing: SheetAnswerItem | undefined, incoming: SheetAnswerItem): boolean {
  if (!existing) return true;
  return ANSWER_FIELDS.some((field) => !meaningful(existing[field]) && meaningful(incoming[field]));
}

export function analyzeAnswerMerge(
  existingEntry: WrongAnswerEntry,
  importedData: Pick<Partial<EntryFormData>, "answerKey">,
): AnswerMergeAnalysis {
  const existing = answerMap(existingEntry);
  const targets = targetQuestionNumbers(existingEntry);
  const incoming = (importedData.answerKey ?? []).map(normalizeIncoming);
  const counts = new Map<string, number>();
  for (const item of incoming) {
    const number = normalizeQuestionNumber(item.questionNumber);
    if (number) counts.set(number, (counts.get(number) ?? 0) + 1);
  }

  const rows = incoming.map((item, index): AnswerMergeRow => {
    const number = normalizeQuestionNumber(item.questionNumber);
    const key = `${number || "unmatched"}:${index}`;
    if (!number || !targets.has(number)) {
      return { key, questionNumber: number || item.questionNumber || "미상", incoming: item, status: "unmatched", fieldConflicts: [] };
    }
    if ((counts.get(number) ?? 0) > 1) {
      return { key, questionNumber: number, existing: existing.get(number), incoming: item, status: "duplicate", fieldConflicts: [] };
    }
    const current = existing.get(number);
    if (!current) return { key, questionNumber: number, incoming: item, status: "add", fieldConflicts: [] };
    const fieldConflicts = fieldsForComparison(current, item);
    return {
      key,
      questionNumber: number,
      existing: current,
      incoming: item,
      status: fieldConflicts.length ? "conflict" : hasSupplement(current, item) ? "supplement" : "unchanged",
      fieldConflicts,
    };
  });

  const duplicateNumbers = [...new Set(rows.filter((row) => row.status === "duplicate").map((row) => row.questionNumber))];
  return {
    rows,
    blockingIssues: duplicateNumbers.map((number) => `${number}번 답안이 새 자료에 중복됩니다.`),
    warnings: rows.filter((row) => row.status === "unmatched").map((row) => `${row.questionNumber}번 답안을 기존 문제지에 연결할 수 없습니다.`),
  };
}

function selectedValue(
  current: SheetAnswerItem,
  incoming: SheetAnswerItem,
  field: AnswerMergeField,
  resolution: AnswerMergeResolution | undefined,
): unknown {
  const choice = resolution?.fieldChoices?.[field];
  if (choice === "incoming" && meaningful(incoming[field])) return clone(incoming[field]);
  if (meaningful(current[field])) return clone(current[field]);
  return meaningful(incoming[field]) ? clone(incoming[field]) : clone(current[field]);
}

function mergeAnswerItems(current: SheetAnswerItem, incoming: SheetAnswerItem, resolution: AnswerMergeResolution | undefined): SheetAnswerItem {
  const next = clone(current);
  for (const field of ANSWER_FIELDS) {
    const value = selectedValue(current, incoming, field, resolution);
    if (value !== undefined) (next as unknown as Record<string, unknown>)[field] = value;
  }
  next.questionNumber = current.questionNumber;
  next.id = current.id;
  return next;
}

function appendUnique<T>(base: T[], incoming: T[], key: (value: T) => string, make: (value: T) => T): T[] {
  const next = base.map(clone);
  const keys = new Set(next.map(key));
  for (const value of incoming) {
    const candidate = make(value);
    const candidateKey = key(candidate);
    if (!keys.has(candidateKey)) {
      next.push(candidate);
      keys.add(candidateKey);
    }
  }
  return next;
}

export function applyAnswerMerge(
  existingEntry: WrongAnswerEntry,
  importedData: Partial<EntryFormData>,
  resolutions: AnswerMergeResolution[],
  options: ApplyAnswerMergeOptions = {},
): EntryFormData {
  const idFactory = options.idFactory ?? uuidv4;
  const allowed = new Set(options.allowedFields ?? ["answerKey", "explanationParts", "figures", "sourcePageImages", "learningBlocks"]);
  const resolutionMap = new Map(resolutions.map((item) => [item.key, item]));
  const analysis = analyzeAnswerMerge(existingEntry, importedData);
  const resolutionIssues = getAnswerMergeResolutionIssues(
    existingEntry,
    analysis,
    resolutions,
  );
  if (resolutionIssues.length > 0) {
    throw new Error(resolutionIssues.join(" "));
  }
  const answerKey = (existingEntry.answerKey ?? []).map(clone);

  if (allowed.has("answerKey")) {
    for (const row of analysis.rows) {
      const incoming = row.incoming;
      if (!incoming) continue;
      const resolution = resolutionMap.get(row.key);
      if (resolution?.excluded || (row.status === "duplicate" && !resolution?.useDuplicate)) continue;
      const targetNumber = normalizeQuestionNumber(resolution?.targetQuestionNumber || row.questionNumber);
      if (!targetNumber) continue;
      const index = answerKey.findIndex((item) => normalizeQuestionNumber(item.questionNumber) === targetNumber);
      if (index >= 0) {
        answerKey[index] = mergeAnswerItems(answerKey[index], incoming, resolution);
      } else if (targetQuestionNumbers(existingEntry).has(targetNumber)) {
        answerKey.push({ ...clone(incoming), id: idFactory(), questionNumber: targetNumber });
      }
    }
  }

  const resource = options.resource ? clone(options.resource) : undefined;
  const next: EntryFormData = {
    ...clone(existingEntry),
    answerKey,
    explanationParts: existingEntry.explanationParts.map(clone),
    figures: (existingEntry.figures ?? []).map(clone),
    sourcePageImages: [...(existingEntry.sourcePageImages ?? [])],
    learningBlocks: (existingEntry.learningBlocks ?? []).map(clone),
    supplementalResources: (existingEntry.supplementalResources ?? []).map(clone),
  };

  if (allowed.has("explanationParts")) {
    next.explanationParts = appendUnique(next.explanationParts, importedData.explanationParts ?? [], (part) => `${part.text}\u0000${part.images.join("\u0000")}`, (part) => ({ ...clone(part), id: idFactory() }));
  }
  if (allowed.has("figures")) {
    next.figures = appendUnique(next.figures ?? [], importedData.figures ?? [], (figure) => `${normalizeQuestionNumber(figure.questionNumber)}\u0000${figure.image ?? ""}\u0000${figure.caption}`, (figure) => ({ ...clone(figure), id: idFactory() }));
  }
  if (allowed.has("sourcePageImages")) next.sourcePageImages = [...new Set([...(next.sourcePageImages ?? []), ...(importedData.sourcePageImages ?? [])])];
  if (allowed.has("learningBlocks")) {
    next.learningBlocks = appendUnique(next.learningBlocks ?? [], importedData.learningBlocks ?? [], (block) => `${block.type}\u0000${block.title}\u0000${block.content}\u0000${block.sourceQuestionNumber ?? ""}`, (block) => ({ ...clone(block), id: idFactory() }));
  }
  if (resource) next.supplementalResources = [...(next.supplementalResources ?? []), resource];
  return next;
}

export function mergeResourceLink(entry: WrongAnswerEntry, sourceEntryId: string, kind: "lecture" | "concept", title: string, now = new Date().toISOString()): EntryFormData {
  const linkedEntryIds = [...new Set([...(entry.linkedEntryIds ?? []), sourceEntryId])];
  const alreadyLinked = (entry.linkedEntryIds ?? []).includes(sourceEntryId);
  const resources = alreadyLinked
    ? [...(entry.supplementalResources ?? [])]
    : [...(entry.supplementalResources ?? []), { id: uuidv4(), kind, title, sourceEntryId, createdAt: now, updatedAt: now, appliedFields: [] }];
  return { ...clone(entry), linkedEntryIds, supplementalResources: resources };
}
