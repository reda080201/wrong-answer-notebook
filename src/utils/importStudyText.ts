import type { ChecklistItem, Difficulty, EntryFormData, EntryKind, ExplanationPart, ImportRejectedItem, LectureSourceType, QuestionContentSegment, QuestionSourceCrop, SheetAnswerItem, SheetFigureItem, StructuredQuestion, Subject } from "../types";
import { SUBJECTS } from "../types";
import { normalizeAnswerKey, normalizeDiagramSpec, normalizeFigures, normalizeLearningBlocks, normalizeLearningDiagramType, normalizeQuestionContentSegments, normalizeStructuredQuestions } from "./entry";
import { renderStructuredQuestionsCompatibilityText } from "./entryQuestions";
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
import { applyAutomaticFigurePreference } from "../features/figures/services/figureRepresentation";
import { maxAnswerDifficultyScore, normalizeDifficultyScore } from "./difficulty";
import { decodeTextFile } from "../features/import/services/decodeTextFile";
import { normalizeImportedMathCommands } from "./legacyMathCommands";
import { isValidNormalizedCrop } from "./normalizedCrop";
import { resolveImportProcessingStatus } from "./importProcessingStatus";

export type ImportDetectedFormat = "json" | "text";

export interface ImportedStudyText {
  detectedFormat: ImportDetectedFormat;
  data: Partial<EntryFormData>;
  entryKindResolution?: EntryKindResolution;
  warnings?: string[];
}

export interface EntryKindResolution {
  entryKind: EntryKind;
  source: "explicit" | "import_type" | "heuristic";
}

/** Removes trust claims from untrusted GPT/ZIP input without touching persisted-load normalization. */
export function sanitizeExternalImportTrust(entry: unknown): unknown {
  if (!entry || typeof entry !== "object") return entry;
  const value = structuredClone(entry) as Record<string, unknown>;
  const sanitizeFigure = (raw: unknown) => {
    if (!raw || typeof raw !== "object") return raw;
    const figure = raw as Record<string, unknown>;
    const verificationValue = figure.verification && typeof figure.verification === "object"
      ? figure.verification as Record<string, unknown>
      : undefined;
    const suppliedSource = verificationValue?.verificationSource;
    const trustedClaimOnly = suppliedSource === "user" || suppliedSource === "local_validator" || suppliedSource === "machine_checked";
    const cleaned = figure.cleaned && typeof figure.cleaned === "object" ? figure.cleaned as Record<string, unknown> : undefined;
    const verifiedAutomatic = suppliedSource === "second_pass_model"
      && verificationValue?.status === "verified"
      && Array.isArray(verificationValue.blockingIssues)
      && verificationValue.blockingIssues.length === 0;
    // A package cannot claim that our local deterministic pipeline produced an
    // image. Keep the asset for comparison, but reserve automatic selection for
    // evidence the application can independently evaluate.
    const claimedDeterministicGenerator = cleaned?.generatedBy === "deterministic_cleanup"
      || cleaned?.generatedBy === "deterministic_redraw";
    const canRemainReady = figure.processingStatus !== "rejected" && verifiedAutomatic && !claimedDeterministicGenerator;
    const verification = verificationValue
      ? {
        ...verificationValue,
        verificationSource: trustedClaimOnly ? "none" : (verificationValue.verificationSource === "gpt_self_check" || verificationValue.verificationSource === "second_pass_model" ? verificationValue.verificationSource : "none"),
        userApproved: false,
        status: canRemainReady ? verificationValue.status : "needs_review",
      }
      : undefined;
    return {
      ...figure,
      representationSelectionSource: figure.representationSelectionSource === "automatic" ? "automatic" : undefined,
      cleaned: cleaned && claimedDeterministicGenerator
        ? { ...cleaned, generatedBy: "gpt", untrustedGeneratedBy: cleaned.generatedBy }
        : cleaned,
      preferredRepresentation: canRemainReady ? figure.preferredRepresentation : "original",
      processingStatus: canRemainReady && figure.processingStatus !== "rejected" ? "ready" : "needs_review",
      needsReview: Boolean(figure.needsReview) || !canRemainReady,
      verification,
    };
  };
  if (Array.isArray(value.figures)) value.figures = value.figures.map(sanitizeFigure);
  if (Array.isArray(value.entries)) value.entries = value.entries.map((item) => sanitizeExternalImportTrust(item));
  return value;
}

export type ImportV2Type = "problem_sheet" | "concept_entries" | "lecture" | "mixed";

export interface ImportedStudyDocument {
  schemaVersion?: "wrong-answer-notebook-import-v2";
  importType: ImportV2Type | "single";
  title?: string;
  subject?: Subject;
  entries: Partial<EntryFormData>[];
  entryKindResolutions?: EntryKindResolution[];
  warnings?: string[];
  /** ZIP assets are kept in memory until the user commits the import. */
  assetFiles?: File[];
}

interface ImportJsonShape {
  entryKind?: unknown;
  title?: unknown;
  subject?: unknown;
  question?: unknown;
  questions?: unknown;
  questionImages?: unknown;
  sourcePageImages?: unknown;
  questionSourceCrops?: unknown;
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
  questionContentSegments?: unknown;
  contentSegments?: unknown;
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

interface QuestionExportDocument {
  schemaVersion?: unknown;
  title?: unknown;
  subject?: unknown;
  questions?: unknown;
}

const DEFAULT_TAGS: string[] = [];

export interface ExternalQuestionSourceCropNormalization {
  crops: QuestionSourceCrop[];
  invalidQuestionNumbers: string[];
  warnings: string[];
}

/**
 * Normalizes source-crop evidence at the untrusted import boundary. It never
 * changes persisted entries and deliberately refuses path-shaped asset names.
 */
export function normalizeExternalQuestionSourceCrops(raw: unknown): ExternalQuestionSourceCropNormalization {
  if (!Array.isArray(raw)) return { crops: [], invalidQuestionNumbers: [], warnings: [] };

  const seenIds = new Set<string>();
  const invalidQuestionNumbers = new Set<string>();
  const warnings: string[] = [];
  const crops = raw.flatMap((item, index): QuestionSourceCrop[] => {
    if (!item || typeof item !== "object") {
      warnings.push(`원본 crop ${index + 1}의 형식이 올바르지 않아 제외했습니다.`);
      return [];
    }
    const value = item as Record<string, unknown>;
    const questionNumber = normalizeQuestionNumber(String(value.questionNumber ?? ""));
    const image = typeof value.image === "string" ? value.image.trim() : "";
    const sourcePageImage = typeof value.sourcePageImage === "string" ? value.sourcePageImage.trim() : undefined;
    if (!questionNumber || !image) {
      warnings.push(`원본 crop ${index + 1}에 문항 번호 또는 이미지가 없어 제외했습니다.`);
      return [];
    }
    if (!isSafeImportAssetReference(image) || (sourcePageImage && !isSafeImportAssetReference(sourcePageImage))) {
      throw new ImportParseError(`원본 crop ${index + 1}의 이미지 참조가 안전한 ZIP 경로가 아닙니다.`);
    }
    const page = typeof value.page === "number" && Number.isInteger(value.page) && value.page > 0
      ? value.page
      : undefined;
    const order = typeof value.order === "number" && Number.isFinite(value.order) ? value.order : index;
    const suppliedId = typeof value.id === "string" ? value.id.trim() : "";
    const fallbackId = `import-crop:${questionNumber}:${order}:${stableImportCropHash(`${image}\u0000${sourcePageImage ?? ""}\u0000${page ?? ""}\u0000${index}`)}`;
    const id = suppliedId && !seenIds.has(suppliedId) ? suppliedId : fallbackId;
    seenIds.add(id);

    const rawRect = value.cropRect && typeof value.cropRect === "object"
      ? value.cropRect
      : undefined;
    const cropRect = rawRect && isValidNormalizedCrop(rawRect) ? rawRect : undefined;
    if (rawRect && !cropRect) {
      invalidQuestionNumbers.add(questionNumber);
      warnings.push(`${questionNumber}번 원본 crop 좌표가 0~1 범위를 벗어나 검수가 필요합니다. 좌표는 자동 보정하지 않았습니다.`);
    }
    return [{ id, questionNumber, page, order, image, sourcePageImage, cropRect }];
  });
  return { crops, invalidQuestionNumbers: [...invalidQuestionNumbers], warnings };
}

function rawRejectedItem(kind: ImportRejectedItem["kind"], value: unknown, reason: string, questionNumber?: string): ImportRejectedItem {
  return { kind, questionNumber, reason, raw: structuredClone(value) };
}

function textOnlyRejectedQuestion(question: StructuredQuestion): StructuredQuestion | undefined {
  const questionNumber = normalizeQuestionNumber(question.questionNumber);
  const questionText = question.questionText.trim() || question.contentSegments
    .filter((segment) => segment.type === "text")
    .map((segment) => segment.text)
    .join(" ")
    .trim();
  if (!questionNumber || !questionText) return undefined;
  return {
    ...question,
    questionNumber,
    questionText,
    conditions: [],
    equations: [],
    choices: [],
    contentSegments: [{ id: `rejected-original:${questionNumber}`, type: "text", text: questionText }],
    figureIds: [],
    needsReview: true,
    processingStatus: "needs_review",
    warning: [question.warning, "구조화 결과가 거부되어 원문 텍스트만 보존했습니다."].filter(Boolean).join(" "),
  };
}

function normalizeExternalStructuredQuestions(raw: unknown): { questions?: StructuredQuestion[]; rejectedItems: ImportRejectedItem[] } {
  if (!Array.isArray(raw)) return { questions: normalizeStructuredQuestions(raw), rejectedItems: [] };
  const rawItems = raw;
  const rejectedItems: ImportRejectedItem[] = [];
  const questions: StructuredQuestion[] = [];
  rawItems.forEach((value, index) => {
    const isRejected = Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).processingStatus === "rejected");
    if (!isRejected) {
      // Normalize one item at a time so rejected evidence can stay in its
      // original position without weakening strict validation for accepted data.
      const normalized = normalizeStructuredQuestions([value])?.[0];
      if (normalized) questions.push(normalized);
      return;
    }

    // Keep strict validation for usable external questions. A malformed rejected
    // item is evidence only and must not make otherwise valid imports fail. Do
    // this in the source loop so fallback questions retain their original order.
    let normalized: StructuredQuestion | undefined;
    try {
      normalized = normalizeStructuredQuestions([value])?.[0];
    } catch {
      normalized = undefined;
    }
    const fallback = normalized ? textOnlyRejectedQuestion(normalized) : undefined;
    const rawValue = value && typeof value === "object" ? value as Record<string, unknown> : undefined;
    const rawNumber = normalizeQuestionNumber(String(rawValue?.questionNumber ?? ""));
    rejectedItems.push(rawRejectedItem(
      "structured_question",
      value,
      fallback ? "파생 구조가 거부되어 원문 텍스트 fallback으로 보존했습니다." : "문항 번호 또는 본문 identity를 확인할 수 없어 canonical 문항에서 제외했습니다.",
      rawNumber || undefined,
    ));
    if (fallback) questions.push(fallback);
  });

  const seenNumbers = new Set<string>();
  for (const question of questions) {
    if (seenNumbers.has(question.questionNumber)) {
      throw new ImportParseError(`duplicates question number ${question.questionNumber}`);
    }
    seenNumbers.add(question.questionNumber);
  }
  return { questions: questions.length ? questions : undefined, rejectedItems };
}

function removeRejectedAnswers(raw: unknown, answers: SheetAnswerItem[]): { answers: SheetAnswerItem[]; rejectedItems: ImportRejectedItem[] } {
  const rawItems = Array.isArray(raw) ? raw : [];
  const rejectedItems: ImportRejectedItem[] = [];
  const rawByNumber = new Map<string, unknown[]>();
  for (const rawItem of rawItems) {
    const value = rawItem && typeof rawItem === "object" ? rawItem as Record<string, unknown> : undefined;
    const number = normalizeQuestionNumber(String(value?.questionNumber ?? ""));
    if (!number) continue;
    const bucket = rawByNumber.get(number) ?? [];
    bucket.push(rawItem);
    rawByNumber.set(number, bucket);
  }
  const accepted = answers.filter((answer) => {
    const number = normalizeQuestionNumber(answer.questionNumber);
    const rawItem = rawByNumber.get(number)?.shift();
    if (answer.processingStatus !== "rejected") return true;
    rejectedItems.push(rawRejectedItem("answer", rawItem ?? { questionNumber: answer.questionNumber, answer: answer.answer }, "거부된 정답은 canonical answer key에서 제외하고 audit evidence로 보존했습니다.", number || undefined));
    return false;
  });
  return { answers: accepted, rejectedItems };
}

function stableImportCropHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function markCropReviewOnStructuredQuestions(
  questions: StructuredQuestion[] | undefined,
  invalidQuestionNumbers: string[],
): StructuredQuestion[] | undefined {
  if (!questions?.length || !invalidQuestionNumbers.length) return questions;
  const invalid = new Set(invalidQuestionNumbers);
  return questions.map((question) => {
    if (!invalid.has(normalizeQuestionNumber(question.questionNumber))) return question;
    const warning = "원본 crop 좌표를 확인해야 합니다.";
    return {
      ...question,
      needsReview: true,
      processingStatus: resolveImportProcessingStatus({
        externalStatus: question.processingStatus,
        legacyNeedsReview: question.needsReview,
        localNeedsReview: true,
      }),
      warning: question.warning ? `${question.warning} ${warning}` : warning,
    };
  });
}

function markCropReviewOnQuestionMeta(
  questionMeta: EntryFormData["questionMeta"] | undefined,
  invalidQuestionNumbers: string[],
): EntryFormData["questionMeta"] | undefined {
  if (!invalidQuestionNumbers.length) return questionMeta;
  const invalid = new Set(invalidQuestionNumbers);
  const seen = new Set<string>();
  const existing = (questionMeta ?? []).map((item) => {
    const number = normalizeQuestionNumber(item.questionNumber);
    seen.add(number);
    return invalid.has(number) ? { ...item, needsReview: true } : item;
  });
  return [
    ...existing,
    ...invalidQuestionNumbers
      .filter((number) => !seen.has(number))
      .map((questionNumber) => ({
        questionNumber,
        important: false,
        needsReview: true,
        updatedAt: new Date().toISOString(),
      })),
  ];
}

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
  return (await decodeTextFile(file)).text;
}

export function parseImportedStudyText(
  input: string,
  filename?: string,
  fallbackSubject: Subject = "수학",
): ImportedStudyText {
  const result = parseImportedStudyTextInternal(input, filename, fallbackSubject);
  return { ...result, data: sanitizeExternalImportTrust(normalizeImportedEntryMath(result.data)) as Partial<EntryFormData> };
}

function parseImportedStudyTextInternal(
  input: string,
  filename?: string,
  fallbackSubject: Subject = "수학",
): ImportedStudyText {
  const trimmed = stripBom(input).trim();
  const parsed = tryParseImportJson(input);

  if (isImportV2Wrapper(parsed)) {
    const document = parseAllInOneImport(input, filename, fallbackSubject);
    if (document.entries.length === 1) {
      return { detectedFormat: "json", data: document.entries[0], entryKindResolution: document.entryKindResolutions?.[0], warnings: document.warnings };
    }
    throw new ImportParseError(
      `v2 wrapper에 entries가 ${document.entries.length}개 있습니다. 다중 항목 preview를 사용해 주세요.`,
    );
  }

  if (isImportJson(parsed)) {
    if (getString((parsed as ImportJsonShape & { schemaVersion?: unknown }).schemaVersion) === "wrong-answer-notebook-question-export-v1") {
      return { detectedFormat: "json", data: normalizeQuestionExportDocument(parsed as QuestionExportDocument, fallbackSubject) };
    }
    const resolution = resolveEntryKind(parsed);
    const entryKind = resolution.entryKind;
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
            questionImages: normalizeTextList(parsed.questionImages),
            sourcePageImages: normalizeTextList(parsed.sourcePageImages),
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
          entryKindResolution: resolution,
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
            questionImages: normalizeTextList(parsed.questionImages),
            sourcePageImages: normalizeTextList(parsed.sourcePageImages),
            difficult: false,
            difficulty: "none",
            myAnswer: "",
            correctAnswer: "",
            explanationParts: [],
            answerKey: [],
            figures: normalizeImportFigures(parsed.figures),
            learningBlocks,
            sourceType: normalizeLectureSourceType(parsed.sourceType),
            linkedEntryIds: normalizeTextList(parsed.linkedEntryIds),
            mistakeAnalysis: normalizeMistakeAnalysis(parsed.mistakeAnalysis),
            annotations: [],
            mastered: parsed.mastered === true,
          },
          entryKindResolution: resolution,
        };
      }
    }

    const cropNormalization = normalizeExternalQuestionSourceCrops(parsed.questionSourceCrops);
    const structuredResult = normalizeExternalStructuredQuestions(parsed.questions);
    const structuredQuestions = markCropReviewOnStructuredQuestions(
      structuredResult.questions,
      cropNormalization.invalidQuestionNumbers,
    );
    const rawQuestion = getString(parsed.question) || (structuredQuestions?.length
      ? renderStructuredQuestionsCompatibilityText(structuredQuestions)
      : "");
    const normalizedAnswers = scrubRejectedNotesFromAnswers(normalizeAnswerKey(parsed.answerKey), normalizeRejectedNotes(parsed.rejectedNotes));
    const answerResult = removeRejectedAnswers(parsed.answerKey, normalizedAnswers);
    const answerOnlyKey = answerResult.answers;
    const rejectedItems = [...structuredResult.rejectedItems, ...answerResult.rejectedItems];
    const answerOnlyBlocks = normalizeLearningBlocks(parsed.learningBlocks);
    const answerOnlyFigures = normalizeImportFigures(parsed.figures, answerOnlyKey, answerOnlyBlocks);
    if (!rawQuestion.trim() && (
      answerOnlyKey.length > 0 ||
      answerOnlyFigures.length > 0 ||
      answerOnlyBlocks.length > 0 ||
      normalizeTextList(parsed.sourcePageImages).length > 0 ||
      normalizeTextList(parsed.questionImages).length > 0 ||
      cropNormalization.crops.length > 0 ||
      rejectedItems.length > 0
    )) {
      return {
        detectedFormat: "json",
        data: {
          entryKind: "problem_sheet",
          subject: normalizeSubject(parsed.subject, fallbackSubject),
          title: getString(parsed.title) || titleFromFilename(filename) || "추가 자료",
          question: "",
          memo: getString(parsed.memo),
          correctAnswer: getString(parsed.correctAnswer),
          tags: normalizeTags(parsed.tags),
          answerKey: answerOnlyKey,
          figures: answerOnlyFigures,
          learningBlocks: answerOnlyBlocks,
          questionMeta: markCropReviewOnQuestionMeta(
            mergeQuestionMetaWithAnswerAnalysis(parsed.questionMeta, answerOnlyKey),
            cropNormalization.invalidQuestionNumbers,
          ),
          questionContentSegments: undefined,
          importAudit: normalizeImportAudit({ ...(parsed.audit && typeof parsed.audit === "object" ? parsed.audit : {}), rejectedItems }, { question: "", answerKey: answerOnlyKey, figures: answerOnlyFigures }),
          rejectedNotes: normalizeRejectedNotes(parsed.rejectedNotes),
          mistakeAnalysis: normalizeMistakeAnalysis(parsed.mistakeAnalysis),
          questionImages: normalizeTextList(parsed.questionImages),
          sourcePageImages: normalizeTextList(parsed.sourcePageImages),
          questionSourceCrops: cropNormalization.crops,
          difficult: false,
          difficulty: "none",
          difficultyScore: maxAnswerDifficultyScore(answerOnlyKey),
          myAnswer: "",
          explanationParts: normalizeExplanationParts(parsed.explanationParts),
          annotations: [],
          mastered: false,
        },
          entryKindResolution: resolution,
          warnings: cropNormalization.warnings,
      };
    }
    if (rawQuestion.trim()) {
      const rejectedNotes = normalizeRejectedNotes(parsed.rejectedNotes);
      const question = removeFigureTokens(removeRejectedNotes(rawQuestion, rejectedNotes));
      const questionContentSegments = normalizeQuestionContentSegments(parsed.questionContentSegments ?? parsed.contentSegments)
        ?? (structuredQuestions?.length
          ? Object.fromEntries(structuredQuestions.map((item) => [item.questionNumber, item.contentSegments]))
          : undefined)
        ?? contentSegmentsFromQuestionTokens(rawQuestion);
      const importantNotes = splitImportantNotes(parsed.importantNotes);
      const normalizedAnswerKey = scrubRejectedNotesFromAnswers(applyQuestionMetadata(
        attachQuestionNotes(normalizeAnswerKey(parsed.answerKey), importantNotes.questionNotes),
        parsed.difficultyByQuestion,
        question,
      ), rejectedNotes);
      const answerResult = removeRejectedAnswers(parsed.answerKey, normalizedAnswerKey);
      const answerKey = answerResult.answers;
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
      const importAudit = normalizeImportAudit({ ...(parsed.audit && typeof parsed.audit === "object" ? parsed.audit : {}), rejectedItems: answerResult.rejectedItems.length || structuredResult.rejectedItems.length ? [...structuredResult.rejectedItems, ...answerResult.rejectedItems] : undefined }, {
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
          questionMeta: markCropReviewOnQuestionMeta(
            mergeQuestionMetaWithAnswerAnalysis(parsed.questionMeta, answerKey),
            cropNormalization.invalidQuestionNumbers,
          ),
          structuredQuestions,
          questionContentSegments,
          importAudit,
          rejectedNotes,
          mistakeAnalysis: normalizeMistakeAnalysis(parsed.mistakeAnalysis),
          questionImages: normalizeTextList(parsed.questionImages),
          sourcePageImages: normalizeTextList(parsed.sourcePageImages),
          questionSourceCrops: cropNormalization.crops,
          difficult: false,
          difficulty: "none",
          difficultyScore,
          myAnswer: "",
          explanationParts: normalizeExplanationParts(parsed.explanationParts),
          annotations: [],
          mastered: false,
        },
          entryKindResolution: resolution,
          warnings: cropNormalization.warnings,
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

function normalizeImportedText(value: string | undefined): string | undefined {
  return value === undefined ? undefined : normalizeImportedMathCommands(value);
}

function normalizeImportedAnswer(item: SheetAnswerItem): SheetAnswerItem {
  return {
    ...item,
    answer: normalizeImportedMathCommands(item.answer),
    explanation: normalizeImportedMathCommands(item.explanation),
    strategy: normalizeImportedText(item.strategy),
    steps: item.steps?.map(normalizeImportedMathCommands),
    choiceJudgements: item.choiceJudgements?.map((judgement) => ({
      ...judgement,
      text: normalizeImportedMathCommands(judgement.text),
    })),
    wrongPoint: normalizeImportedText(item.wrongPoint),
    reviewPoint: normalizeImportedText(item.reviewPoint),
    notes: normalizeImportedText(item.notes),
    importantPoints: item.importantPoints.map(normalizeImportedMathCommands),
    sourceNote: normalizeImportedText(item.sourceNote),
  };
}

function normalizeImportedSegment(segment: QuestionContentSegment): QuestionContentSegment {
  if (segment.type === "text" || segment.type === "condition") {
    return { ...segment, text: normalizeImportedMathCommands(segment.text) };
  }
  if (segment.type === "equation") return { ...segment, latex: normalizeImportedMathCommands(segment.latex) };
  if (segment.type === "table") return { ...segment, rows: segment.rows.map((row) => row.map(normalizeImportedMathCommands)) };
  return segment;
}

function normalizeImportedEntryMath(data: Partial<EntryFormData>): Partial<EntryFormData> {
  const questionContentSegments = data.questionContentSegments
    ? Object.fromEntries(Object.entries(data.questionContentSegments).map(([number, segments]) => [number, segments.map(normalizeImportedSegment)]))
    : data.questionContentSegments;

  return {
    ...data,
    question: normalizeImportedText(data.question),
    memo: normalizeImportedText(data.memo),
    correctAnswer: normalizeImportedText(data.correctAnswer),
    explanationParts: data.explanationParts?.map((part) => ({
      ...part,
      text: normalizeImportedMathCommands(part.text),
    })),
    answerKey: data.answerKey?.map(normalizeImportedAnswer),
    structuredQuestions: data.structuredQuestions?.map((question) => ({
      ...question,
      questionText: normalizeImportedMathCommands(question.questionText),
      conditions: question.conditions.map(normalizeImportedMathCommands),
      equations: question.equations.map(normalizeImportedMathCommands),
      choices: question.choices.map(normalizeImportedMathCommands),
      contentSegments: question.contentSegments.map(normalizeImportedSegment),
    })),
    questionContentSegments,
  };
}

function normalizeQuestionExportDocument(document: QuestionExportDocument, fallbackSubject: Subject): Partial<EntryFormData> {
  const questions = Array.isArray(document.questions) ? document.questions : [];
  const segments: Record<string, QuestionContentSegment[]> = {};
  const figures: SheetFigureItem[] = [];
  const blocks: string[] = [];
  for (const [index, raw] of questions.entries()) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const number = getString(item.displayQuestionNumber) || String(index + 1);
    const question = getString(item.question);
    if (getString(item.passage)) blocks.push(`[자료]\n${getString(item.passage)}`);
    blocks.push(`${number}. ${question}`);
    const choices = Array.isArray(item.choices) ? item.choices.map((choice) => getString(choice)).filter(Boolean) : [];
    blocks.push(...choices);
    if (Array.isArray(item.contentSegments)) {
      const normalized = item.contentSegments.flatMap((segment, segmentIndex): QuestionContentSegment[] => {
        if (!segment || typeof segment !== "object") return [];
        const value = segment as Record<string, unknown>;
        const id = getString(value.id) || `segment-${segmentIndex + 1}`;
        if (value.type === "text" && typeof value.text === "string") return [{ id, type: "text", text: value.text }];
        if (value.type === "condition" && typeof value.text === "string") return [{ id, type: "condition", text: value.text, label: getString(value.label) || undefined }];
        if (value.type === "figure" && getString(value.figureId)) return [{ id, type: "figure", figureId: getString(value.figureId) }];
        return [];
      });
      if (normalized.length) segments[number] = normalized;
    }
    if (Array.isArray(item.figures)) for (const rawFigure of item.figures) {
      if (!rawFigure || typeof rawFigure !== "object") continue;
      const figure = rawFigure as Record<string, unknown>;
      figures.push({ id: getString(figure.id) || `figure-${number}-${figures.length + 1}`, questionNumber: number, title: getString(figure.title), caption: getString(figure.caption), image: getString(figure.image) || undefined, source: figure.source === "described_only" ? "described_only" : figure.source === "gpt_cleaned" ? "gpt_cleaned" : "original", placement: figure.placement && typeof figure.placement === "object" ? figure.placement as SheetFigureItem["placement"] : undefined });
    }
  }
  return { entryKind: "problem_sheet", title: getString(document.title) || "문항 추출본", subject: normalizeSubject(document.subject, fallbackSubject), question: blocks.join("\n"), questionImages: figures.flatMap((figure) => figure.image ? [figure.image] : []), figures, questionContentSegments: segments, tags: ["문항 추출본"], memo: "문항 추출본으로 가져왔습니다.", difficult: false, difficulty: "none", myAnswer: "", correctAnswer: "", explanationParts: [], answerKey: [], annotations: [], mastered: false };
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
    const resolution = resolveEntryKind(parsed);
    const normalized = normalizeAllInOneEntry(
      sanitizeExternalImportTrust({ ...parsed, entryKind: resolution.entryKind }) as ImportJsonShape,
      filename,
      fallbackSubject,
    );
    return {
      importType: "single",
      title: getString(parsed.title) || undefined,
      subject: normalizeSubject(parsed.subject, fallbackSubject),
      entries: [normalized.data],
      entryKindResolutions: [resolution],
      warnings: normalized.warnings,
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
  const inferredResolutions = rawImportType ? undefined : inferEntryKindResolutions(rawEntries);
  const importType = rawImportType
    ? validateImportType(rawImportType)
    : inferImportType(inferredResolutions ?? []);
  if (!SUPPORTED_V2_IMPORT_TYPES.has(importType)) {
    throw new ImportParseError("지원하지 않는 importType입니다.");
  }

  const wrapperSubject = normalizeSubject((parsed as ImportV2Wrapper).subject, fallbackSubject);
  const wrapperTitle = getString((parsed as ImportV2Wrapper).title);
  const entryKindResolutions: EntryKindResolution[] = [];
  const warnings: string[] = [];
  const entries = rawEntries.map((rawEntry, index) => {
    if (!isImportJson(rawEntry)) throw new ImportParseError(`entries[${index}]의 형식이 올바르지 않습니다.`);
    const resolution = inferredResolutions?.[index] ?? resolveEntryKind(rawEntry, importType, index);
    entryKindResolutions.push(resolution);
    const entryKind = resolution.entryKind;
    assertImportTypeMatches(importType, entryKind);
    const entrySubject = normalizeSubject(rawEntry.subject, wrapperSubject);
    const withWrapperDefaults: ImportJsonShape = {
      ...rawEntry,
      entryKind,
      subject: rawEntry.subject ?? wrapperSubject,
      title: rawEntry.title ?? (rawEntries.length === 1 ? wrapperTitle : undefined),
    };
    const normalized = normalizeAllInOneEntry(
      sanitizeExternalImportTrust(withWrapperDefaults) as ImportJsonShape,
      rawEntries.length === 1 ? filename : undefined,
      entrySubject,
    );
    warnings.push(...(normalized.warnings ?? []).map((warning) => `entries[${index}]: ${warning}`));
    return normalized.data;
  });

  return {
    schemaVersion: schemaVersion ? "wrong-answer-notebook-import-v2" : undefined,
    importType,
    title: wrapperTitle || undefined,
    subject: wrapperSubject,
    entries,
    entryKindResolutions,
    warnings: warnings.length ? warnings : undefined,
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

/** Safe relative references are accepted while a ZIP is being staged. */
export function isSafeImportAssetReference(value: string): boolean {
  const trimmed = value.trim();
  return Boolean(trimmed)
    && !trimmed.startsWith("/")
    && !/^[A-Za-z]:/.test(trimmed)
    && !trimmed.includes("\\")
    && !trimmed.split("/").some((part) => !part || part === "." || part === "..")
    && /\.(png|jpe?g|webp)$/i.test(trimmed);
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

function entryKindForImportType(importType: ImportV2Type): EntryKind | undefined {
  if (importType === "problem_sheet") return "problem_sheet";
  if (importType === "concept_entries") return "concept";
  if (importType === "lecture") return "lecture";
  return undefined;
}

function validateImportType(value: string): ImportV2Type {
  if (!SUPPORTED_V2_IMPORT_TYPES.has(value as ImportV2Type)) {
    throw new ImportParseError("지원하지 않는 importType입니다.");
  }
  return value as ImportV2Type;
}

function inferSingleEntryKind(value: ImportJsonShape): EntryKind {
  if (value.question || value.answerKey || value.audit || value.figures) return "problem_sheet";
  if (value.sourceType && Array.isArray(value.learningBlocks) && value.learningBlocks.length > 0) return "lecture";
  throw new ImportParseError("entryKind를 결정할 수 없습니다. problem_sheet, wrong_answer, concept, lecture 중 하나를 선택하세요.");
}

function resolveEntryKind(
  value: ImportJsonShape,
  importType?: ImportV2Type,
  index?: number,
): EntryKindResolution {
  const explicit = getString(value.entryKind) as EntryKind;
  if (explicit) {
    if (!SUPPORTED_ENTRY_KINDS.has(explicit)) throw new ImportParseError("지원하지 않는 entryKind입니다.");
    return { entryKind: explicit, source: "explicit" };
  }
  const fromImportType = importType ? entryKindForImportType(importType) : undefined;
  if (fromImportType) return { entryKind: fromImportType, source: "import_type" };
  if (importType === "mixed") {
    throw new ImportParseError(`entries[${index ?? 0}]의 entryKind를 결정할 수 없습니다. problem_sheet, wrong_answer, concept, lecture 중 하나를 선택하세요.`);
  }
  return { entryKind: inferSingleEntryKind(value), source: "heuristic" };
}

function inferEntryKindResolutions(entries: unknown[]): EntryKindResolution[] {
  return entries.map((entry, index) => {
    if (!isImportJson(entry)) throw new ImportParseError(`entries[${index}]의 형식이 올바르지 않습니다.`);
    return resolveEntryKind(entry, undefined, index);
  });
}

function inferImportType(resolutions: EntryKindResolution[]): ImportV2Type {
  const kinds = resolutions.map(({ entryKind }) => entryKind);
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
): Pick<ImportedStudyText, "data" | "warnings"> {
  const result = parseImportedStudyText(JSON.stringify(value), filename, fallbackSubject);
  if (result.detectedFormat !== "json") {
    throw new ImportParseError("가져올 항목을 앱 데이터로 변환하지 못했습니다.");
  }
  return { data: result.data, warnings: result.warnings };
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
  const adapted = Array.isArray(value) ? value.map((item) => {
    if (!item || typeof item !== "object") return item;
    const raw = item as Record<string, unknown>;
    const representations = raw.representations && typeof raw.representations === "object"
      ? raw.representations as Record<string, unknown>
      : undefined;
    const semantic = raw.semanticSpec && typeof raw.semanticSpec === "object"
      ? raw.semanticSpec as Record<string, unknown>
      : undefined;
    const cleaned = representations?.cleaned && typeof representations.cleaned === "object"
      ? representations.cleaned as Record<string, unknown>
      : raw.cleaned;
    return {
      ...raw,
      image: raw.image ?? (cleaned && typeof cleaned === "object" ? (cleaned as Record<string, unknown>).image : undefined),
      original: raw.original ?? representations?.original,
      cleaned: raw.cleaned ?? (cleaned && typeof cleaned === "object" ? {
        ...cleaned,
        // v2 sources may not provide internal generation provenance. Keep the
        // image while forcing a review rather than discarding the asset.
        sourceImageHash: (cleaned as Record<string, unknown>).sourceImageHash ?? "imported-v2",
        promptVersion: (cleaned as Record<string, unknown>).promptVersion ?? "import-v2",
      } : undefined),
      semanticSpec: semantic ? { ...semantic, type: semantic.type ?? semantic.kind } : raw.semanticSpec,
    };
  }) : value;
  return normalizeFigures(adapted).map((figure) => {
    const suppliedVerificationSource = figure.verification?.verificationSource;
    const safe = (filename: string | undefined) => filename && isSafeImportAssetReference(filename) ? filename : undefined;
    const image = safe(figure.image);
    const originalImage = safe(figure.original?.image);
    const sourcePageImage = safe(figure.original?.sourcePageImage);
    const cleanedImage = safe(figure.cleaned?.image);
    const original = figure.original
      ? originalImage
        ? { ...figure.original, image: originalImage, sourcePageImage }
        : undefined
      : undefined;
    const cleaned = figure.cleaned && cleanedImage
      ? { ...figure.cleaned, image: cleanedImage }
      : undefined;
    const hadInvalidReference = Boolean(
      (figure.image && !image) ||
      (figure.original?.image && !originalImage) ||
      (figure.original?.sourcePageImage && !sourcePageImage) ||
      (figure.cleaned?.image && !cleanedImage),
    );
    const canDescribe = Boolean(figure.caption.trim()) || hasDiagramForQuestion(figure.questionNumber, answerKey, learningBlocks);
    const forgedAutomaticClaim = suppliedVerificationSource === "user"
      || suppliedVerificationSource === "local_validator"
      || suppliedVerificationSource === "machine_checked"
      || figure.verification?.userApproved === true
      || figure.representationSelectionSource === "user";
    const normalized = {
      ...figure,
      original,
      cleaned,
      // External JSON may describe a user decision, but only an in-app click can create one.
      representationSelectionSource: figure.representationSelectionSource === "automatic" ? "automatic" as const : undefined,
      verification: figure.verification
        ? {
          ...figure.verification,
          userApproved: false,
          verificationSource: forgedAutomaticClaim
            ? "gpt_self_check" as const
            : figure.verification.verificationSource === "second_pass_model" || figure.verification.verificationSource === "gpt_self_check"
            ? figure.verification.verificationSource
            : "none" as const,
        }
        : undefined,
      image,
      source: image ? figure.source : canDescribe ? "described_only" : figure.source,
      needsReview: figure.needsReview || hadInvalidReference,
    };
    if (forgedAutomaticClaim && normalized.cleaned?.generatedBy !== "deterministic_cleanup") {
      normalized.processingStatus = "needs_review";
      normalized.needsReview = true;
      normalized.preferredRepresentation = "original";
    }
    const automatic = applyAutomaticFigurePreference(normalized);
    return {
      ...automatic,
      image: automatic.image,
      source: automatic.source,
      preferredRepresentation: automatic.preferredRepresentation,
      needsReview: automatic.needsReview,
    };
  });
}

function mergeQuestionMetaWithAnswerAnalysis(
  raw: unknown,
  answerKey: SheetAnswerItem[],
): NonNullable<EntryFormData["questionMeta"]> {
  const metas = normalizeQuestionMeta(raw);
  const next = [...metas];
  for (const answer of answerKey) {
    if (!answer.mistakeAnalysis?.causes.length) continue;
    const normalized = normalizeQuestionNumber(answer.questionNumber);
    if (!normalized) continue;
    const index = next.findIndex((meta) => normalizeQuestionNumber(meta.questionNumber) === normalized);
    if (index >= 0) {
      if (!next[index].mistakeAnalysis?.causes.length) {
        next[index] = { ...next[index], mistakeAnalysis: answer.mistakeAnalysis };
      }
      continue;
    }
    next.push({
      questionNumber: normalized,
      important: false,
      mistakeAnalysis: answer.mistakeAnalysis,
      updatedAt: new Date().toISOString(),
    });
  }
  return next;
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

function contentSegmentsFromQuestionTokens(question: string): Record<string, QuestionContentSegment[]> | undefined {
  const entries = parseQuestionText(question)
    .filter((block) => block.kind === "question")
    .flatMap((block) => {
      const segments = block.bodySegments.flatMap((body, index): QuestionContentSegment[] => {
        const id = `import-${normalizeQuestionNumber(block.numberLabel) || block.displayNumber}-${index + 1}`;
        const figure = body.text.trim().match(/^\[FIGURE:([^\]]+)\]$/i);
        if (figure?.[1]) return [{ id, type: "figure", figureId: figure[1].trim() }];
        return [body.kind === "condition"
          ? { id, type: "condition", label: body.label, text: body.text }
          : { id, type: "text", text: body.text }];
      });
      return segments.length ? [[normalizeQuestionNumber(block.numberLabel) || String(block.displayNumber), segments] as const] : [];
    });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function removeFigureTokens(question: string): string {
  return question.replace(/^\s*\[FIGURE:[^\]]+\]\s*(?:\r?\n)?/gim, "").trim();
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
