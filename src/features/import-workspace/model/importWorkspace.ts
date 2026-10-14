import { applyQuestionCompatibilityEdits, COMPATIBILITY_REVIEW_WARNING, type CompatibilityEdit } from "../../../utils/questionCompatibility";
import type { EntryFormData, ExplanationPart, QuestionContentSegment, SheetAnswerItem, SheetFigureItem, StructuredQuestion, Subject } from "../../../types";
import { normalizeStructuredQuestionType } from "../../../utils/structuredQuestionType";
import { stripLegacyChoiceSeparator } from "../../../utils/legacyChoiceSeparator";
import { normalizeQuestionPresentationSegments } from "../../../utils/questionPresentation";

function projectCondition(segment: Extract<QuestionContentSegment, { type: "condition" }>): string {
  return segment.label && !segment.text.trimStart().startsWith(segment.label)
    ? `${segment.label} ${segment.text}` : segment.text;
}

export type ImportWorkspaceStatus = "analyzing" | "review_required" | "ready" | "saving" | "completed" | "failed";
export type ImportQuestionStatus = "ready" | "needs_review" | "missing_answer" | "duplicate_number" | "unassigned_image" | "invalid";
export type ImportWarningSeverity = "info" | "warning" | "error";

export interface ImportSourceFile { id: string; name: string; type: "question" | "answer" | "explanation" | "image" | "json" | "unknown"; size: number; order: number; detectedGroupId?: string; }
export interface ImportAsset { id: string; filename: string; mimeType: string; size: number; sourceFileId: string; kind: "figure" | "source-page" | "unassigned"; linkedQuestionIds: string[]; }
export interface ImportAssetSessionAsset {
  sourceName: string;
  stagedFilename?: string;
  size: number;
  sha256?: string;
  lastModified: number;
}
export interface ImportAssetSessionManifest {
  id: string;
  mode: "memory-only" | "tauri-staged";
  manifestVersion?: 1;
  createdAt?: string;
  sourceToStaged?: Record<string, string>;
  assets: ImportAssetSessionAsset[];
}
export interface ImportSourceReference { sourceFileId?: string; assetId?: string; page?: number; note?: string; }
export interface ImportWorkspaceWarning { id: string; severity: ImportWarningSeverity; message: string; groupId?: string; questionId?: string; acknowledged?: boolean; }
export interface ImportAnswerDraft extends Partial<SheetAnswerItem> { id: string; questionId?: string; confidence?: number; confirmed?: boolean; }
export interface ImportFigureDraft extends SheetFigureItem { assetId?: string; confirmed?: boolean; }
export interface ImportQuestionDraft {
  originalStructuredQuestion?: StructuredQuestion;
  id: string; groupId: string; order: number; displayQuestionNumber: string; sourceQuestionNumber?: string; passage?: string;
  section?: string; questionType?: string; conditions?: string[]; equations?: string[]; points?: number;
  contentSegments: QuestionContentSegment[]; choices: Array<{ id: string; marker: string; content: string }>;
  figures: ImportFigureDraft[]; questionImageAssets: string[]; sourcePageAssets: string[]; answer?: ImportAnswerDraft; explanationParts: ExplanationPart[];
  sourceReferences: ImportSourceReference[]; status: ImportQuestionStatus; warnings: string[]; sourceText?: string;
  needsReview?: boolean; warning?: string; source?: StructuredQuestion["source"]; figureIds?: string[];
  confirmed?: { groupId?: boolean; order?: boolean; content?: boolean; answer?: boolean; figures?: boolean };
}
export type ImportEntryMetadata = Partial<Pick<EntryFormData,
  "problemSource" | "importAudit" | "questionMeta" | "sheetGroup" | "tags" |
  "difficulty" | "difficultyScore" | "concepts" | "checklist" | "learningBlocks" |
  "questionSourceCrops" | "questionSolutionHotspots" | "memo" | "myAnswer" | "correctAnswer" | "annotations" | "difficult" | "mastered"
>> & { unknownFields?: Record<string, unknown> };
export interface ImportDraftGroup { compatibilityText?: string; originalQuestions?: Array<{ id: string; question: StructuredQuestion }>; solutionHotspotCandidates?: import("../../solutions/HotspotLinkEditor").HotspotCandidate[]; id: string; title: string; subject?: Subject; roundLabel?: string; detectedTitle?: string; confidence?: number; entryMetadata?: ImportEntryMetadata; explanationParts?: ExplanationPart[]; questions: ImportQuestionDraft[]; answerItems: ImportAnswerDraft[]; sourceFileIds: string[]; userConfirmed: boolean; }
export interface ImportContentBlock { id: string; kind: "title" | "passage" | "question" | "choice" | "answer" | "explanation" | "page-number" | "other"; text?: string; assetId?: string; sourceFileId?: string; excluded?: boolean; }
export interface ImportCommitAttempt { entryIds: string[]; groupIds: string[]; state: "pending" | "completed"; attemptId?: string; createdAt?: string; entryDigests?: string[]; preparedEntries?: EntryFormData[]; sourceToSaved?: Record<string, string>; }
export interface ImportWorkspace { commitAttempt?: ImportCommitAttempt; id: string; createdAt: string; updatedAt: string; status: ImportWorkspaceStatus; sourceFiles: ImportSourceFile[]; assets: ImportAsset[]; assetSession?: ImportAssetSessionManifest; groups: ImportDraftGroup[]; unassignedBlocks: ImportContentBlock[]; excludedBlocks: ImportContentBlock[]; warnings: ImportWorkspaceWarning[]; revision: number; }

export function normalizeChoice(value: string, index: number): { id: string; marker: string; content: string } {
  const match = value.trim().match(/^(①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩|\(\d{1,2}\)|\d{1,2}\)|[ㄱ-ㅎA-Ea-e][.)])\s*(.*)$/);
  return { id: `choice-${index + 1}`, marker: match?.[1] ?? "", content: stripLegacyChoiceSeparator((match?.[2] ?? value).trim()) };
}

function cloneContentSegment(segment: QuestionContentSegment): QuestionContentSegment {
  return segment.type === "table"
    ? { ...segment, rows: segment.rows.map((row) => [...row]) }
    : { ...segment };
}

function cloneContentSegments(segments: QuestionContentSegment[]): QuestionContentSegment[] {
  return segments.map(cloneContentSegment);
}

function segmentValue(segment: QuestionContentSegment): string | undefined {
  if (segment.type === "text" || segment.type === "condition") return segment.text;
  if (segment.type === "equation") return segment.latex;
  return undefined;
}

function textSegmentIndexes(segments: QuestionContentSegment[]): number[] {
  return segments.flatMap((segment, index) => segment.type === "text" ? [index] : []);
}

export function hasAmbiguousLegacySourceText(question: ImportQuestionDraft): boolean {
  const sourceText = question.sourceText?.trim();
  if (sourceText === undefined) return false;
  const segments = question.contentSegments;
  const indexes = textSegmentIndexes(segments);
  if (indexes.length <= 1) return false;
  const joined = indexes.map((index) => segmentValue(segments[index]) ?? "").join("\n").trim();
  return joined !== sourceText;
}

function applyLegacySourceText(question: ImportQuestionDraft, segments: QuestionContentSegment[]): QuestionContentSegment[] {
  const sourceText = question.sourceText?.trim();
  if (sourceText === undefined) return segments;
  const indexes = textSegmentIndexes(segments);
  if (indexes.length === 0) return [{ id: `legacy-${question.id}`, type: "text", text: sourceText }, ...segments];
  if (indexes.length === 1) {
    const target = indexes[0];
    return segments.map((segment, index) => index === target ? { id: segment.id, type: "text", text: sourceText } : segment);
  }
  const joined = indexes.map((index) => segmentValue(segments[index]) ?? "").join("\n").trim();
  return joined === sourceText ? segments : segments;
}

export function getEditableContentSegments(question: ImportQuestionDraft): QuestionContentSegment[] {
  const segments = applyLegacySourceText(question, cloneContentSegments(question.contentSegments));
  return normalizeQuestionPresentationSegments({
    questionText: question.sourceText ?? "",
    conditions: question.conditions ?? [],
    equations: question.equations ?? [],
    contentSegments: segments,
  });
}

export function updateDraftContentSegment(question: ImportQuestionDraft, segmentId: string, value: string): ImportQuestionDraft {
  const contentSegments = getEditableContentSegments(question).map((segment) => {
    if (segment.id !== segmentId) return segment;
    if (segment.type === "text" || segment.type === "condition") return { ...segment, text: value };
    if (segment.type === "equation") return { ...segment, latex: value };
    return segment;
  });
  const conditions = contentSegments.filter((segment): segment is Extract<QuestionContentSegment, { type: "condition" }> => segment.type === "condition").map(projectCondition).filter(Boolean);
  const equations = contentSegments.filter((segment): segment is Extract<QuestionContentSegment, { type: "equation" }> => segment.type === "equation").map((segment) => segment.latex).filter(Boolean);
  return {
    ...question,
    sourceText: undefined,
    contentSegments,
    conditions,
    equations,
    status: "needs_review",
    confirmed: { ...question.confirmed, content: true },
  };
}

export function draftContentSegments(question: ImportQuestionDraft): QuestionContentSegment[] {
  if (hasAmbiguousLegacySourceText(question)) {
    throw new Error(`문항 ${question.displayQuestionNumber}번의 기존 본문이 여러 text segment로 나뉘어 있어 자동 병합할 수 없습니다. 문항을 다시 검토해 주세요.`);
  }
  return getEditableContentSegments(question);
}

function projectSemanticFields(question: ImportQuestionDraft, segments: QuestionContentSegment[]) {
  const text = segments.filter((segment): segment is Extract<QuestionContentSegment, { type: "text" }> => segment.type === "text").map((segment) => segment.text).join("\n").trim();
  const conditions = segments.filter((segment): segment is Extract<QuestionContentSegment, { type: "condition" }> => segment.type === "condition").map(projectCondition).filter(Boolean);
  const equations = segments.filter((segment): segment is Extract<QuestionContentSegment, { type: "equation" }> => segment.type === "equation").map((segment) => segment.latex).filter(Boolean);
  return {
    questionText: text || question.sourceText?.trim() || "",
    conditions: conditions.length ? conditions : [...(question.conditions ?? [])],
    equations: equations.length ? equations : [...(question.equations ?? [])],
  };
}

export function questionDraftToEntryData(group: ImportDraftGroup, question?: ImportQuestionDraft): Partial<EntryFormData> {
  const questions = question ? [question] : group.questions;
  const structuredQuestions: StructuredQuestion[] = questions.map((item) => {
    const contentSegments = draftContentSegments(item);
    const semantic = projectSemanticFields(item, contentSegments);
    return {
    questionNumber: item.displayQuestionNumber,
    ...(item.section ? { section: item.section } : {}),
    ...(normalizeStructuredQuestionType(item.questionType)
      ? { questionType: normalizeStructuredQuestionType(item.questionType) }
      : {}),
    ...(item.points !== undefined ? { points: item.points } : {}),
    questionText: semantic.questionText,
    conditions: semantic.conditions,
    equations: semantic.equations,
    choices: item.choices.map((choice) => `${choice.marker} ${choice.content}`.trim()),
    contentSegments,
    ...(item.source ? { source: { ...item.source } } : {}),
    ...(item.needsReview !== undefined || item.status !== "ready" ? { needsReview: Boolean(item.needsReview || item.status !== "ready") } : {}),
    ...(item.status === "invalid" ? { processingStatus: "rejected" as const } : item.status !== "ready" ? { processingStatus: "needs_review" as const } : {}),
    ...(item.warning ? { warning: item.warning } : {}),
    figureIds: [...(item.figureIds ?? [])],
  };
  });
  const originalIds = new Set(group.originalQuestions?.map(item => item.id) ?? []);
  const byId = new Map(questions.map((item, index) => [item.id, structuredQuestions[index]]));
  const edits: CompatibilityEdit[] = (group.originalQuestions ?? []).map(item => ({ before: item.question, after: byId.get(item.id) }));
  const extraQuestions = questions.filter(item => !originalIds.has(item.id));
  for (const item of extraQuestions) edits.push({ before: undefined, after: byId.get(item.id), passage: item.passage });
  const compatibility = applyQuestionCompatibilityEdits(group.compatibilityText ?? "", edits.length ? edits : structuredQuestions.map(after => ({ before: undefined, after })));
  const questionText = compatibility.text;
  if (compatibility.unresolved.length) for (const item of structuredQuestions) {
    if (!compatibility.unresolved.includes(item.questionNumber)) continue;
    item.needsReview = true;
    item.warning = [...new Set([item.warning, COMPATIBILITY_REVIEW_WARNING].filter(Boolean))].join(" ");
  }
  const questionContentSegments = Object.fromEntries(structuredQuestions.map((item) => [item.questionNumber, cloneContentSegments(item.contentSegments)]));
  const explanationParts = [...(group.explanationParts ?? []), ...questions.flatMap((item) => item.explanationParts)];
  const seenExplanations = new Set<string>();
  const dedupedExplanationParts = explanationParts.filter((part) => {
    const key = `${part.text.trim()}\u0000${[...part.images].sort().join("\u0000")}`;
    if (seenExplanations.has(key)) return false;
    seenExplanations.add(key);
    return true;
  });
  const metadata = group.entryMetadata ?? {};
  const { unknownFields, ...knownMetadata } = metadata;
  return {
    ...unknownFields,
    ...knownMetadata,
    entryKind: "problem_sheet",
    title: group.title,
    subject: group.subject ?? "기타",
    question: questionText,
    questionImages: [...new Set(questions.flatMap((item) => item.questionImageAssets))],
    sourcePageImages: [...new Set(questions.flatMap((item) => item.sourcePageAssets))],
    figures: [...new Map(questions.flatMap(item => item.figures).map(figure => {
      const collisions = questions.flatMap(item => item.figures).filter(item => item.id === figure.id);
      if (collisions.some(item => JSON.stringify(item) !== JSON.stringify(figure))) throw new Error(`그림 ${figure.id}의 연결이 서로 달라 검토가 필요합니다.`);
      return [figure.id, figure] as const;
    })).values()],
    structuredQuestions,
    questionContentSegments,
    answerKey: questions.flatMap((item) => item.answer ? [item.answer as SheetAnswerItem] : []),
    explanationParts: dedupedExplanationParts,
    tags: metadata.tags ?? [],
    difficult: metadata.difficult ?? false,
    difficulty: metadata.difficulty ?? "none",
    difficultyScore: metadata.difficultyScore,
    myAnswer: metadata.myAnswer ?? "",
    correctAnswer: metadata.correctAnswer ?? "",
    annotations: structuredClone(metadata.annotations ?? []),
    memo: metadata.memo ?? "",
    mastered: metadata.mastered ?? false,
  };
}
