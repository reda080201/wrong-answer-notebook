import type { EntryFormData, ExplanationPart, QuestionContentSegment, SheetAnswerItem, SheetFigureItem, Subject } from "../../../types";

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
  contentSegments: QuestionContentSegment[]; choices: Array<{ id: string; marker: string; content: string }>;
  figures: ImportFigureDraft[]; sourcePageAssets: string[]; answer?: ImportAnswerDraft; explanationParts: ExplanationPart[];
  sourceReferences: ImportSourceReference[]; status: ImportQuestionStatus; warnings: string[]; sourceText?: string;
  confirmed?: { groupId?: boolean; order?: boolean; content?: boolean; answer?: boolean; figures?: boolean };
}
export interface ImportDraftGroup { id: string; title: string; subject?: Subject; roundLabel?: string; detectedTitle?: string; confidence?: number; questions: ImportQuestionDraft[]; answerItems: ImportAnswerDraft[]; sourceFileIds: string[]; userConfirmed: boolean; }
export interface ImportContentBlock { id: string; kind: "title" | "passage" | "question" | "choice" | "answer" | "explanation" | "page-number" | "other"; text?: string; assetId?: string; sourceFileId?: string; excluded?: boolean; }
export interface ImportWorkspace { id: string; createdAt: string; updatedAt: string; status: ImportWorkspaceStatus; sourceFiles: ImportSourceFile[]; assets: ImportAsset[]; assetSession?: ImportAssetSessionManifest; groups: ImportDraftGroup[]; unassignedBlocks: ImportContentBlock[]; excludedBlocks: ImportContentBlock[]; warnings: ImportWorkspaceWarning[]; revision: number; }

export function normalizeChoice(value: string, index: number): { id: string; marker: string; content: string } {
  const match = value.trim().match(/^(①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩|\(\d{1,2}\)|\d{1,2}\)|[ㄱ-ㅎA-Ea-e][.)])\s*(.*)$/);
  return { id: `choice-${index + 1}`, marker: match?.[1] ?? "", content: (match?.[2] ?? value).trim() };
}

export function questionDraftToEntryData(group: ImportDraftGroup, question?: ImportQuestionDraft): Partial<EntryFormData> {
  const questions = question ? [question] : group.questions;
  const questionText = questions.map((item) => [`${item.displayQuestionNumber}. ${item.contentSegments.filter((segment) => segment.type !== "figure").map((segment) => "text" in segment ? segment.text : segment.type === "equation" ? segment.latex : "").filter(Boolean).join("\n")}`, ...item.choices.map((choice) => `${choice.marker} ${choice.content}`.trim())].filter(Boolean).join("\n")).join("\n\n");
  const questionContentSegments = Object.fromEntries(questions.map((item) => [item.displayQuestionNumber, item.contentSegments]));
  return { entryKind: "problem_sheet", title: group.title, subject: group.subject ?? "기타", question: questionText, questionImages: [...new Set(questions.flatMap((item) => item.sourcePageAssets))], figures: questions.flatMap((item) => item.figures), questionContentSegments, answerKey: questions.flatMap((item) => item.answer ? [item.answer as SheetAnswerItem] : []), explanationParts: questions.flatMap((item) => item.explanationParts), tags: [], difficult: false, difficulty: "none", myAnswer: "", correctAnswer: "", annotations: [], memo: "", mastered: false };
}
