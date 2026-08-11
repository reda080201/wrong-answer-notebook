import type { EntryFormData, ExplanationPart, QuestionContentSegment, SheetAnswerItem, SheetFigureItem, StructuredQuestion, Subject } from "../../../types";

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
  "difficulty" | "difficultyScore" | "concepts" | "checklist" | "learningBlocks"
>> & { unknownFields?: Record<string, unknown> };
export interface ImportDraftGroup { id: string; title: string; subject?: Subject; roundLabel?: string; detectedTitle?: string; confidence?: number; entryMetadata?: ImportEntryMetadata; explanationParts?: ExplanationPart[]; questions: ImportQuestionDraft[]; answerItems: ImportAnswerDraft[]; sourceFileIds: string[]; userConfirmed: boolean; }
export interface ImportContentBlock { id: string; kind: "title" | "passage" | "question" | "choice" | "answer" | "explanation" | "page-number" | "other"; text?: string; assetId?: string; sourceFileId?: string; excluded?: boolean; }
export interface ImportWorkspace { id: string; createdAt: string; updatedAt: string; status: ImportWorkspaceStatus; sourceFiles: ImportSourceFile[]; assets: ImportAsset[]; assetSession?: ImportAssetSessionManifest; groups: ImportDraftGroup[]; unassignedBlocks: ImportContentBlock[]; excludedBlocks: ImportContentBlock[]; warnings: ImportWorkspaceWarning[]; revision: number; }

export function normalizeChoice(value: string, index: number): { id: string; marker: string; content: string } {
  const match = value.trim().match(/^(①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩|\(\d{1,2}\)|\d{1,2}\)|[ㄱ-ㅎA-Ea-e][.)])\s*(.*)$/);
  return { id: `choice-${index + 1}`, marker: match?.[1] ?? "", content: (match?.[2] ?? value).trim() };
}

function cloneContentSegment(segment: QuestionContentSegment): QuestionContentSegment {
  return segment.type === "table"
    ? { ...segment, rows: segment.rows.map((row) => [...row]) }
    : { ...segment };
}

function cloneContentSegments(segments: QuestionContentSegment[]): QuestionContentSegment[] {
  return segments.map(cloneContentSegment);
}

function draftQuestionText(question: ImportQuestionDraft): string {
  return (question.sourceText ?? question.contentSegments.map((segment) => {
    if (segment.type === "text" || segment.type === "condition") return segment.text;
    if (segment.type === "equation") return segment.latex;
    return "";
  }).filter(Boolean).join("\n")).trim();
}

function draftContentSegments(question: ImportQuestionDraft): QuestionContentSegment[] {
  const sourceText = question.sourceText?.trim();
  if (sourceText === undefined) return cloneContentSegments(question.contentSegments);
  const currentText = question.contentSegments
    .filter((segment): segment is Extract<QuestionContentSegment, { type: "text" }> => segment.type === "text")
    .map((segment) => segment.text)
    .join("\n")
    .trim();
  if (sourceText === currentText) return cloneContentSegments(question.contentSegments);
  let replaced = false;
  const segments = question.contentSegments.flatMap((segment) => {
    if (segment.type !== "text") return [cloneContentSegment(segment)];
    if (replaced) return [];
    replaced = true;
    return [{ id: segment.id, type: "text" as const, text: sourceText }];
  });
  return replaced ? segments : [{ id: "segment-1", type: "text", text: sourceText }, ...segments];
}

export function questionDraftToEntryData(group: ImportDraftGroup, question?: ImportQuestionDraft): Partial<EntryFormData> {
  const questions = question ? [question] : group.questions;
  const structuredQuestions: StructuredQuestion[] = questions.map((item) => ({
    questionNumber: item.displayQuestionNumber,
    ...(item.section ? { section: item.section } : {}),
    ...(item.questionType ? { questionType: item.questionType } : {}),
    ...(item.points !== undefined ? { points: item.points } : {}),
    questionText: draftQuestionText(item),
    conditions: [...(item.conditions ?? [])],
    equations: [...(item.equations ?? [])],
    choices: item.choices.map((choice) => `${choice.marker} ${choice.content}`.trim()),
    contentSegments: draftContentSegments(item),
    ...(item.source ? { source: { ...item.source } } : {}),
    ...(item.needsReview !== undefined ? { needsReview: item.needsReview } : {}),
    ...(item.warning ? { warning: item.warning } : {}),
    figureIds: [...(item.figureIds ?? [])],
  }));
  const questionText = structuredQuestions.map((item) => [
    `${item.questionNumber}. ${item.questionText}`,
    ...item.conditions,
    ...item.equations,
    ...item.choices,
  ].filter(Boolean).join("\n")).join("\n\n");
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
    figures: questions.flatMap((item) => item.figures),
    structuredQuestions,
    questionContentSegments,
    answerKey: questions.flatMap((item) => item.answer ? [item.answer as SheetAnswerItem] : []),
    explanationParts: dedupedExplanationParts,
    tags: metadata.tags ?? [],
    difficult: false,
    difficulty: metadata.difficulty ?? "none",
    difficultyScore: metadata.difficultyScore,
    myAnswer: "",
    correctAnswer: "",
    annotations: [],
    memo: "",
    mastered: false,
  };
}
