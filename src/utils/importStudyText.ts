import type { ChecklistItem, Difficulty, EntryFormData, EntryKind, ExplanationPart, LectureSourceType, SheetAnswerItem, SheetFigureItem, Subject } from "../types";
import { SUBJECTS } from "../types";
import { normalizeAnswerKey, normalizeDiagramSpec, normalizeFigures, normalizeLearningBlocks, normalizeLearningDiagramType } from "./entry";
import { normalizeMistakeAnalysis } from "./mistakeAnalysis";
import {
  normalizeImportAudit,
  normalizeRejectedNotes,
  removeRejectedNotes,
  scrubRejectedNotesFromAnswers,
} from "./importAudit";
import { cleanQuestionText } from "./textCleanup";
import { parseQuestionText } from "./textLayout";
import { normalizeQuestionMeta, normalizeQuestionNumber } from "./questionMeta";
import { maxAnswerDifficultyScore, normalizeDifficultyScore } from "./difficulty";

export type ImportDetectedFormat = "json" | "text";

export interface ImportedStudyText {
  detectedFormat: ImportDetectedFormat;
  data: Partial<EntryFormData>;
}

export type ImportV2Type = "problem_sheet" | "concept_entries" | "lecture" | "mixed";

export interface ImportedStudyDocument {
  schemaVersion?: "wrong-answer-notebook-import-v2";
  importType: ImportV2Type | "single";
  title?: string;
  subject?: Subject;
  entries: Partial<EntryFormData>[];
}

interface ImportJsonShape {
  entryKind?: unknown;
  title?: unknown;
  subject?: unknown;
  question?: unknown;
  summary?: unknown;
  tags?: unknown;
  memo?: unknown;
  checklist?: unknown;
  correctAnswer?: unknown;
  explanationParts?: unknown;
  importantNotes?: unknown;
  answerKey?: unknown;
  figures?: unknown;
  learningBlocks?: unknown;
  concepts?: unknown;
  difficulty?: unknown;
  difficultyScore?: unknown;
  difficultyByQuestion?: unknown;
  mistakeAnalysis?: unknown;
  audit?: unknown;
  rejectedNotes?: unknown;
  questionMeta?: unknown;
  sourceType?: unknown;
  linkedEntryIds?: unknown;
  mastered?: unknown;
}

interface ImportV2Wrapper {
  schemaVersion?: unknown;
  importType?: unknown;
  title?: unknown;
  subject?: unknown;
  entries?: unknown;
}

const DEFAULT_TAGS: string[] = [];

export function isImportJson(value: unknown): value is ImportJsonShape {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isImportV2Wrapper(value: unknown): value is ImportV2Wrapper {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as ImportV2Wrapper).schemaVersion === "wrong-answer-notebook-import-v2"
  );
}

export async function readImportFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".txt") && !name.endsWith(".md") && !name.endsWith(".json")) {
    throw new Error(".txt, .md, .json 파일만 가져올 수 있습니다.");
  }
  return file.text();
}

export function parseImportedStudyText(
  input: string,
  filename?: string,
  fallbackSubject: Subject = "수학",
): ImportedStudyText {
  const trimmed = stripBom(input).trim();
  const parsed = tryParseImportJson(input);

  if (isImportV2Wrapper(parsed)) {
    const document = parseAllInOneImport(input, filename, fallbackSubject);
    if (document.entries.length === 1) {
      return { detectedFormat: "json", data: document.entries[0] };
    }
    throw new ImportParseError(
      `v2 wrapper에 entries가 ${document.entries.length}개 있습니다. 다중 항목 preview를 사용해 주세요.`,
    );
  }

  if (isImportJson(parsed)) {
    const entryKind = getString(parsed.entryKind);
    if (entryKind === "concept") {
      const title = getString(parsed.title);
      const summary = getString(parsed.summary) || getString(parsed.question);
      if (title.trim() || summary.trim()) {
        const conceptTitle = title || titleFromText(summary);
        return {
          detectedFormat: "json",
          data: {
            entryKind: "concept",
            subject: normalizeSubject(parsed.subject, fallbackSubject),
            title: conceptTitle,
            question: summary || conceptTitle,
            memo: getString(parsed.memo),
            tags: normalizeTags(parsed.tags),
            checklist: normalizeChecklist(parsed.checklist),
            questionImages: [],
            difficult: false,
            difficulty: "none",
            myAnswer: "",
            correctAnswer: "",
            explanationParts: [],
            answerKey: [],
            learningBlocks: normalizeLearningBlocks(parsed.learningBlocks),
            mistakeAnalysis: normalizeMistakeAnalysis(parsed.mistakeAnalysis),
            annotations: [],
            mastered: false,
          },
        };
      }
    }

    if (entryKind === "lecture") {
      const title = getString(parsed.title) || titleFromFilename(filename) || "특강자료";
      const question = getString(parsed.question) || getString(parsed.summary);
      const learningBlocks = normalizeLearningBlocks(parsed.learningBlocks);
      if (title.trim() || question.trim() || learningBlocks.length) {
        return {
          detectedFormat: "json",
          data: {
            entryKind: "lecture",
            subject: normalizeSubject(parsed.subject, fallbackSubject),
            title,
            question,
            memo: getString(parsed.memo),
            tags: normalizeTags(parsed.tags),
            concepts: normalizeTextList(parsed.concepts),
            checklist: normalizeChecklist(parsed.checklist),
            questionImages: [],
            difficult: false,
            difficulty: "none",
            myAnswer: "",
            correctAnswer: "",
            explanationParts: [],
            answerKey: [],
            figures: [],
            learningBlocks,
            sourceType: normalizeLectureSourceType(parsed.sourceType),
            linkedEntryIds: normalizeTextList(parsed.linkedEntryIds),
            mistakeAnalysis: normalizeMistakeAnalysis(parsed.mistakeAnalysis),
            annotations: [],
            mastered: parsed.mastered === true,
          },
        };
      }
    }

    const rawQuestion = getString(parsed.question);
    if (rawQuestion.trim()) {
      const rejectedNotes = normalizeRejectedNotes(parsed.rejectedNotes);
      const question = removeRejectedNotes(rawQuestion, rejectedNotes);
      const importantNotes = splitImportantNotes(parsed.importantNotes);
      const answerKey = scrubRejectedNotesFromAnswers(applyQuestionMetadata(
        attachQuestionNotes(normalizeAnswerKey(parsed.answerKey), importantNotes.questionNotes),
        parsed.difficultyByQuestion,
        question,
      ), rejectedNotes);
      const concepts = normalizeTextList(parsed.concepts);
      const difficultyScore =
        normalizeDifficultyScore(parsed.difficultyScore) ??
        maxAnswerDifficultyScore(answerKey);
      const questionWithConceptLinks = suggestConceptLinks(cleanQuestionText(question), concepts);
      const learningBlocks = normalizeLearningBlocks(parsed.learningBlocks);
      const figures = normalizeImportFigures(parsed.figures, answerKey, learningBlocks);
      const memo = removeRejectedNotes(mergeMemoAndImportantNotes(getString(parsed.memo), [
        ...importantNotes.globalNotes,
        ...concepts.map((concept) => `연결 개념: [[${concept}]]`),
      ]), rejectedNotes);
      const importAudit = normalizeImportAudit(parsed.audit, {
        question: questionWithConceptLinks,
        answerKey,
        figures,
      });
      return {
        detectedFormat: "json",
        data: {
          entryKind: entryKind === "wrong_answer" ? "wrong_answer" : "problem_sheet",
          subject: normalizeSubject(parsed.subject, fallbackSubject),
          title: getString(parsed.title) || titleFromFilename(filename) || titleFromText(question),
          question: questionWithConceptLinks,
          memo,
          correctAnswer: getString(parsed.correctAnswer),
          tags: normalizeTags(parsed.tags),
          answerKey,
          figures,
          learningBlocks,
          questionMeta: normalizeQuestionMeta(parsed.questionMeta),
          importAudit,
          rejectedNotes,
          mistakeAnalysis: normalizeMistakeAnalysis(parsed.mistakeAnalysis),
          questionImages: [],
          difficult: false,
          difficulty: "none",
          difficultyScore,
          myAnswer: "",
          explanationParts: normalizeExplanationParts(parsed.explanationParts),
          annotations: [],
          mastered: false,
        },
      };
    }
  }

  const markdown = parseMarkdownSections(trimmed);
  const question = cleanQuestionText(markdown.question || trimmed);
  return {
    detectedFormat: "text",
    data: {
      entryKind: "problem_sheet",
      subject: fallbackSubject,
      title: titleFromFilename(filename) || titleFromText(question),
      question,
      tags: DEFAULT_TAGS,
      questionImages: [],
      difficult: false,
      difficulty: "none",
      myAnswer: "",
      correctAnswer: "",
      explanationParts: [],
      memo: mergeMemoAndImportantNotes(markdown.memo, markdown.importantNotes),
      answerKey: markdown.answerKey,
      figures: [],
      learningBlocks: [],
      rejectedNotes: [],
      mistakeAnalysis: { causes: [] },
      annotations: [],
      mastered: false,
    },
  };
}

const SUPPORTED_V2_IMPORT_TYPES = new Set<ImportV2Type>([
  "problem_sheet",
  "concept_entries",
  "lecture",
  "mixed",
]);

const SUPPORTED_ENTRY_KINDS = new Set<EntryKind>([
  "wrong_answer",
  "problem_sheet",
  "concept",
  "lecture",
]);

export function parseAllInOneImport(
  input: string,
  filename?: string,
  fallbackSubject: Subject = "수학",
): ImportedStudyDocument {
  const parsed = parseImportJson(input);
  if (!isImportJson(parsed)) {
    throw new ImportParseError("가져오기 JSON의 최상위 값은 객체여야 합니다.");
  }

  const schemaVersion = getString((parsed as ImportV2Wrapper).schemaVersion);
  if (schemaVersion && schemaVersion !== "wrong-answer-notebook-import-v2") {
    throw new ImportParseError("지원하지 않는 import schemaVersion입니다.");
  }

  const isWrapper = schemaVersion === "wrong-answer-notebook-import-v2" || "entries" in parsed;
  if (!isWrapper) {
    assertEntryKind(parsed);
    return {
      importType: "single",
      title: getString(parsed.title) || undefined,
      subject: normalizeSubject(parsed.subject, fallbackSubject),
      entries: [normalizeAllInOneEntry(parsed, filename, fallbackSubject)],
    };
  }

  const rawEntries = (parsed as ImportV2Wrapper).entries;
  if (!Array.isArray(rawEntries)) {
    if (rawEntries === undefined) {
      throw new ImportParseError("JSON은 읽었지만 가져올 entries 항목이 없습니다.");
    }
    throw new ImportParseError("entries는 배열이어야 합니다.");
  }
  if (!rawEntries.length) {
    throw new ImportParseError("JSON은 읽었지만 가져올 entries 항목이 없습니다.");
  }

  const rawImportType = getString((parsed as ImportV2Wrapper).importType);
  const inferredType = inferImportType(rawEntries);
  const importType = schemaVersion
    ? rawImportType as ImportV2Type
    : inferredType;
  if (!SUPPORTED_V2_IMPORT_TYPES.has(importType)) {
    throw new ImportParseError("지원하지 않는 importType입니다.");
  }

  const wrapperSubject = normalizeSubject((parsed as ImportV2Wrapper).subject, fallbackSubject);
  const wrapperTitle = getString((parsed as ImportV2Wrapper).title);
  const entries = rawEntries.map((rawEntry) => {
    if (!isImportJson(rawEntry)) throw new ImportParseError("가져올 항목에 entryKind가 없습니다.");
    const entryKind = assertEntryKind(rawEntry);
    assertImportTypeMatches(importType, entryKind);
    const entrySubject = normalizeSubject(rawEntry.subject, wrapperSubject);
    const withWrapperDefaults: ImportJsonShape = {
      ...rawEntry,
      subject: rawEntry.subject ?? wrapperSubject,
      title: rawEntry.title ?? (rawEntries.length === 1 ? wrapperTitle : undefined),
    };
    return normalizeAllInOneEntry(
      withWrapperDefaults,
      rawEntries.length === 1 ? filename : undefined,
      entrySubject,
    );
  });

  return {
    schemaVersion: schemaVersion ? "wrong-answer-notebook-import-v2" : undefined,
    importType,
    title: wrapperTitle || undefined,
    subject: wrapperSubject,
    entries,
  };
}

export function isSafeImportImageFilename(value: string): boolean {
  const trimmed = value.trim();
  return (
    Boolean(trimmed) &&
    !trimmed.includes("/") &&
    !trimmed.includes("\\") &&
    !trimmed.includes("..") &&
    !trimmed.startsWith(".") &&
    /\.(png|jpe?g|webp)$/i.test(trimmed)
  );
}

function importJsonCandidates(input: string): string[] {
  const trimmed = stripBom(input.trim()).trim();
  const unwrapped = unwrapFencedJson(trimmed);
  const extracted = extractJsonObjectText(unwrapped);
  return [...new Set([trimmed, unwrapped, extracted].filter(Boolean))];
}

function parseImportJson(input: string): unknown {
  for (const candidate of importJsonCandidates(input)) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next safe representation.
    }
  }
  throw new ImportParseError(
    "JSON 형식으로 읽지 못했습니다. 코드블록이나 설명 문장이 섞였는지 확인하세요.",
  );
}

function tryParseImportJson(input: string): unknown | null {
  try {
    return parseImportJson(input);
  } catch {
    return null;
  }
}

function stripBom(input: string): string {
  return input.startsWith("\uFEFF") ? input.slice(1) : input;
}

/** JSON parse 실패 또는 v2 wrapper 구조 오류를 나타내는 전용 에러 */
export class ImportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportParseError";
  }
}

function unwrapFencedJson(input: string): string {
  const trimmed = input.trim();
  // ```json ... ``` 코드펜스 제거
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function extractJsonObjectText(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return trimmed;
  return trimmed.slice(start, end + 1).trim();
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLectureSourceType(value: unknown): LectureSourceType {
  return value === "html" || value === "md" || value === "txt" || value === "json"
    ? value
    : "json";
}

function assertEntryKind(value: ImportJsonShape): EntryKind {
  const entryKind = getString(value.entryKind) as EntryKind;
  if (!entryKind) throw new ImportParseError("가져올 항목에 entryKind가 없습니다.");
  if (!SUPPORTED_ENTRY_KINDS.has(entryKind)) {
    throw new ImportParseError("지원하지 않는 entryKind입니다.");
  }
  return entryKind;
}

function inferImportType(entries: unknown[]): ImportV2Type {
  const kinds = entries.map((entry) => {
    if (!isImportJson(entry)) throw new ImportParseError("가져올 항목에 entryKind가 없습니다.");
    return assertEntryKind(entry);
  });
  if (kinds.every((kind) => kind === "problem_sheet")) return "problem_sheet";
  if (kinds.every((kind) => kind === "concept")) return "concept_entries";
  if (kinds.every((kind) => kind === "lecture")) return "lecture";
  return "mixed";
}

function assertImportTypeMatches(importType: ImportV2Type, entryKind: EntryKind) {
  const matches =
    importType === "mixed" ||
    (importType === "problem_sheet" && entryKind === "problem_sheet") ||
    (importType === "concept_entries" && entryKind === "concept") ||
    (importType === "lecture" && entryKind === "lecture");
  if (!matches) {
    throw new ImportParseError("importType과 entries의 entryKind가 일치하지 않습니다.");
  }
}

function normalizeAllInOneEntry(
  value: ImportJsonShape,
  filename: string | undefined,
  fallbackSubject: Subject,
): Partial<EntryFormData> {
  const result = parseImportedStudyText(JSON.stringify(value), filename, fallbackSubject);
  if (result.detectedFormat !== "json") {
    throw new ImportParseError("가져올 항목을 앱 데이터로 변환하지 못했습니다.");
  }
  return result.data;
}

function normalizeSubject(value: unknown, fallback: Subject): Subject {
  return typeof value === "string" && SUBJECTS.includes(value as Subject)
    ? (value as Subject)
    : fallback;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_TAGS;
  const tags = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return tags.length ? [...new Set(tags)] : DEFAULT_TAGS;
}

function normalizeTextList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((item) => item.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeChoiceJudgements(value: unknown): Array<{ marker: string; text: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): { marker: string; text: string } | null => {
      if (typeof item === "string") {
        const match = item.match(/^\s*([^:：]{1,12})[:：]\s*(.+)$/);
        return match
          ? { marker: match[1].trim(), text: match[2].trim() }
          : item.trim()
            ? { marker: "", text: item.trim() }
            : null;
      }
      if (!item || typeof item !== "object") return null;
      const typed = item as Record<string, unknown>;
      const text = getString(typed.text) || getString(typed.judgement) || getString(typed.judgment);
      if (!text.trim()) return null;
      return {
        marker: getString(typed.marker),
        text,
      };
    })
    .filter((item): item is { marker: string; text: string } => Boolean(item));
}

function normalizeExplanationParts(value: unknown): ExplanationPart[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Partial<ExplanationPart> => Boolean(item && typeof item === "object"))
    .map((item, index) => ({
      id: typeof item.id === "string" && item.id.trim() ? item.id : `gpt-solution-${index + 1}`,
      text: typeof item.text === "string" ? item.text.trim() : "",
      images: Array.isArray(item.images)
        ? item.images.filter((image): image is string => typeof image === "string")
        : [],
    }))
    .filter((item) => item.text || item.images.length);
}

function hasDiagramForQuestion(
  questionNumber: string,
  answerKey: SheetAnswerItem[],
  learningBlocks: NonNullable<EntryFormData["learningBlocks"]>,
): boolean {
  const normalized = normalizeQuestionNumber(questionNumber);
  return Boolean(normalized) && (
    answerKey.some((item) =>
      normalizeQuestionNumber(item.questionNumber) === normalized && Boolean(item.diagramSpec || item.diagramType),
    ) ||
    learningBlocks.some((block) =>
      normalizeQuestionNumber(block.sourceQuestionNumber) === normalized && Boolean(block.diagramSpec || block.diagramType),
    )
  );
}

function normalizeImportFigures(
  value: unknown,
  answerKey: SheetAnswerItem[] = [],
  learningBlocks: NonNullable<EntryFormData["learningBlocks"]> = [],
): SheetFigureItem[] {
  return normalizeFigures(value).map((figure) => {
    const image = figure.image && isSafeImportImageFilename(figure.image) ? figure.image : undefined;
    const canDescribe = Boolean(figure.caption.trim()) || hasDiagramForQuestion(figure.questionNumber, answerKey, learningBlocks);
    return {
      ...figure,
      image,
      source: image ? figure.source : canDescribe ? "described_only" : figure.source,
      needsReview: figure.needsReview || Boolean(figure.image && !image),
    };
  });
}

function normalizeChecklist(value: unknown): ChecklistItem[] {
  const source = Array.isArray(value) ? value : normalizeTextList(value);
  return source
    .map((item, index): ChecklistItem | null => {
      if (typeof item === "string") {
        const text = item.trim();
        return text ? { id: `import-check-${index + 1}`, text, checked: false } : null;
      }
      if (item && typeof item === "object") {
        const typed = item as { id?: unknown; text?: unknown; checked?: unknown };
        const text = getString(typed.text);
        return text
          ? {
              id: getString(typed.id) || `import-check-${index + 1}`,
              text,
              checked: typed.checked === true,
            }
          : null;
      }
      return null;
    })
    .filter((item): item is ChecklistItem => Boolean(item));
}

function normalizeDifficulty(value: unknown): Difficulty | undefined {
  if (value === "high" || value === "상" || value === "어려움") return "high";
  if (value === "medium" || value === "중" || value === "보통") return "medium";
  if (value === "low" || value === "하" || value === "쉬움") return "low";
  if (value === "none" || value === "없음") return "none";
  return undefined;
}

interface QuestionMetadata {
  difficulty?: Difficulty;
  difficultyScore?: number;
  concepts?: string[];
  diagramType?: SheetAnswerItem["diagramType"];
  diagramSpec?: SheetAnswerItem["diagramSpec"];
  notes?: string;
  importantPoints?: string[];
  strategy?: string;
  steps?: string[];
  choiceJudgements?: Array<{ marker: string; text: string }>;
  wrongPoint?: string;
  reviewPoint?: string;
}

function questionAliasMap(question: string): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const block of parseQuestionText(question)) {
    if (block.kind !== "question") continue;
    const display = String(block.displayNumber);
    const original = normalizeQuestionNumber(block.numberLabel);
    aliases.set(normalizeQuestionNumber(display), original || display);
    if (original) aliases.set(original, display);
  }
  return aliases;
}

function metadataFromObject(value: Record<string, unknown>): QuestionMetadata {
  return {
    difficulty: normalizeDifficulty(value.difficulty),
    difficultyScore: normalizeDifficultyScore(value.difficultyScore),
    concepts: normalizeTextList(value.concepts),
    diagramType: normalizeLearningDiagramType(value.diagramType),
    diagramSpec: normalizeDiagramSpec(value.diagramSpec),
    notes: getString(value.notes) || getString(value.memo) || getString(value.note),
    importantPoints: normalizeTextList(value.importantPoints),
    strategy: getString(value.strategy),
    steps: normalizeTextList(value.steps),
    choiceJudgements: normalizeChoiceJudgements(value.choiceJudgements),
    wrongPoint: getString(value.wrongPoint),
    reviewPoint: getString(value.reviewPoint),
  };
}

function applyQuestionMetadata(answerKey: SheetAnswerItem[], raw: unknown, question = ""): SheetAnswerItem[] {
  if (!raw || typeof raw !== "object") return answerKey;

  const byNumber = new Map<string, QuestionMetadata>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const value = item as { questionNumber?: unknown; number?: unknown; difficulty?: unknown; concepts?: unknown };
      const questionNumber = `${value.questionNumber ?? value.number ?? ""}`.trim();
      if (!questionNumber) continue;
      byNumber.set(normalizeQuestionNumber(questionNumber), metadataFromObject(value as Record<string, unknown>));
    }
  } else {
    for (const [questionNumber, value] of Object.entries(raw)) {
      if (typeof value === "string") {
        byNumber.set(normalizeQuestionNumber(questionNumber), { difficulty: normalizeDifficulty(value) });
      } else if (value && typeof value === "object") {
        byNumber.set(normalizeQuestionNumber(questionNumber), metadataFromObject(value as Record<string, unknown>));
      }
    }
  }

  const aliases = questionAliasMap(question);
  return answerKey.map((item) => {
    const normalized = normalizeQuestionNumber(item.questionNumber);
    const alias = aliases.get(normalized);
    const meta = byNumber.get(normalized) ?? (alias ? byNumber.get(normalizeQuestionNumber(alias)) : undefined);
    return {
      ...item,
      difficulty:
        meta?.difficulty && meta.difficulty !== "none"
          ? meta.difficulty
          : item.difficulty,
      difficultyScore: meta?.difficultyScore ?? item.difficultyScore,
      concepts: meta?.concepts?.length ? meta.concepts : item.concepts,
      diagramType: item.diagramType ?? meta?.diagramType,
      diagramSpec: item.diagramSpec ?? meta?.diagramSpec,
      notes: item.notes?.trim() ? item.notes : meta?.notes?.trim() || item.notes,
      importantPoints: meta?.importantPoints?.length ? meta.importantPoints : item.importantPoints,
      strategy: item.strategy?.trim() ? item.strategy : meta?.strategy?.trim() || item.strategy,
      steps: item.steps?.length ? item.steps : meta?.steps,
      choiceJudgements: item.choiceJudgements?.length ? item.choiceJudgements : meta?.choiceJudgements,
      wrongPoint: item.wrongPoint?.trim() ? item.wrongPoint : meta?.wrongPoint?.trim() || item.wrongPoint,
      reviewPoint: item.reviewPoint?.trim() ? item.reviewPoint : meta?.reviewPoint?.trim() || item.reviewPoint,
    };
  });
}

function splitImportantNotes(raw: unknown): {
  globalNotes: string[];
  questionNotes: Array<{ questionNumber: string; text: string }>;
} {
  const globalNotes: string[] = [];
  const questionNotes: Array<{ questionNumber: string; text: string }> = [];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];

  for (const value of values) {
    if (typeof value === "string") {
      const match = value.match(/(?:문제|문항)?\s*#?(\d{1,3})\s*(?:번|[.)])?\s*[:：-]?\s*(.+)/);
      if (match && /(문제|문항|번)/.test(value)) {
        questionNotes.push({ questionNumber: match[1], text: match[2].trim() || value.trim() });
      } else if (value.trim()) {
        globalNotes.push(value.trim());
      }
      continue;
    }
    if (!value || typeof value !== "object") continue;
    const typed = value as Record<string, unknown>;
    const questionNumber = `${typed.questionNumber ?? typed.number ?? typed.no ?? ""}`.trim();
    const text = getString(typed.notes) || getString(typed.note) || getString(typed.memo) || getString(typed.text);
    if (questionNumber && text.trim()) questionNotes.push({ questionNumber, text });
    else if (text.trim()) globalNotes.push(text);
  }

  return { globalNotes, questionNotes };
}

function attachQuestionNotes(
  answerKey: SheetAnswerItem[],
  notes: Array<{ questionNumber: string; text: string }>,
): SheetAnswerItem[] {
  if (!notes.length) return answerKey;
  const next = answerKey.map((item) => ({ ...item }));
  for (const note of notes) {
    const normalized = normalizeQuestionNumber(note.questionNumber);
    const index = next.findIndex((item) => normalizeQuestionNumber(item.questionNumber) === normalized);
    if (index >= 0) {
      const current = next[index];
      next[index] = {
        ...current,
        notes: [current.notes?.trim(), note.text.trim()].filter(Boolean).join("\n"),
      };
      continue;
    }
    next.push({
      id: "",
      questionNumber: note.questionNumber.trim(),
      answer: "",
      explanation: "",
      notes: note.text.trim(),
      importantPoints: [],
      concepts: [],
    });
  }
  return normalizeAnswerKey(next);
}

function suggestConceptLinks(text: string, concepts: string[]): string {
  let next = text;
  for (const concept of concepts) {
    const trimmed = concept.trim();
    if (!trimmed || next.includes(`[[${trimmed}]]`)) continue;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?<!\\[\\[)${escaped}(?!\\]\\])`, "g");
    next = next.replace(pattern, `[[${trimmed}]]`);
  }
  return next;
}

function mergeMemoAndImportantNotes(memo: string, notes: string[]): string {
  const parts: string[] = [];
  if (memo.trim()) parts.push(memo.trim());
  if (notes.length) {
    parts.push(["중요 포인트", ...notes.map((note) => `- ${note}`)].join("\n"));
  }
  return parts.join("\n\n");
}

function parseMarkdownSections(input: string) {
  const sections = new Map<string, string[]>();
  let current = "question";

  for (const line of input.split(/\r?\n/)) {
    const heading = line.match(/^\s{0,3}#{1,4}\s*(문제|문항|본문|시험지|중요\s*포인트|중요|메모|답안지|답안|정답|해설)\s*$/i);
    if (heading) {
      current = normalizeHeading(heading[1]);
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (!sections.has(current)) sections.set(current, []);
    sections.get(current)?.push(line);
  }

  const question = sectionText(sections, "question");
  const memo = sectionText(sections, "memo");
  const importantNotes = normalizeTextList(sectionText(sections, "importantNotes"));
  const answerKey = parseMarkdownAnswerKey(sectionText(sections, "answerKey"));
  return { question, memo, importantNotes, answerKey };
}

function normalizeHeading(heading: string): string {
  const compact = heading.replace(/\s+/g, "");
  if (compact.includes("중요")) return "importantNotes";
  if (compact.includes("메모")) return "memo";
  if (compact.includes("답안") || compact.includes("정답") || compact.includes("해설")) return "answerKey";
  return "question";
}

function sectionText(sections: Map<string, string[]>, key: string): string {
  return (sections.get(key) ?? []).join("\n").trim();
}

function parseMarkdownAnswerKey(text: string) {
  const items = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s*/, ""))
    .map((line) => {
      const tableParts = line
        .split("|")
        .map((part) => part.trim())
        .filter(Boolean);
      if (tableParts.length >= 2 && !/^[-:]+$/.test(tableParts.join(""))) {
        return {
          questionNumber: tableParts[0].replace(/^(문제\s*)?/, "").replace(/[.)번]\s*$/, ""),
          answer: tableParts[1],
          explanation: tableParts[2] ?? "",
          importantPoints: tableParts[3] ? [tableParts[3]] : [],
          notes: tableParts[4] ?? "",
        };
      }

      const match = line.match(/^(?:문제\s*)?(\d{1,3}|#\d{1,3})[.)번\s]*[:-]?\s*(.+)$/);
      if (!match) {
        return {
          questionNumber: "",
          answer: "",
          explanation: line,
          importantPoints: [],
        };
      }
      const rest = match[2].trim();
      const [answer, ...explanationParts] = rest.split(/\s+[-–—:]\s+/);
      return {
        questionNumber: match[1].replace(/^#/, ""),
        answer: answer.trim(),
        explanation: explanationParts.join(" - ").trim(),
        importantPoints: [],
      };
    });

  return normalizeAnswerKey(items);
}

function titleFromFilename(filename?: string): string {
  if (!filename) return "";
  return filename.replace(/\.[^.]+$/, "").trim().slice(0, 80);
}

function titleFromText(text: string): string {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ? firstLine.slice(0, 80) : "GPT 변환 시험지";
}
