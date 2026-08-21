import { normalizeQuestionNumber } from "./questionMeta";
import { getEntryQuestions } from "./entryQuestions";
import type { LearningBlock, LectureQuestionRelation, WrongAnswerEntry } from "../types";
import type { LectureDocument, LectureDocumentBlock, LectureDocumentBlockType } from "../types";

const VALID_TYPES = new Set<LectureDocumentBlockType>([
  "heading", "paragraph", "math", "image", "figure", "table", "quote", "callout", "example", "warning", "collapsible", "related_concept", "related_question",
]);

function blockType(block: LearningBlock): LectureDocumentBlockType {
  if (block.type === "formula") return "math";
  if (block.type === "diagram") return "figure";
  if (block.type === "warning") return "warning";
  if (block.type === "concept") return "paragraph";
  return "paragraph";
}

export function projectLegacyLearningBlocks(blocks: LearningBlock[] | undefined): LectureDocument {
  return { blocks: (blocks ?? []).map((block) => ({ id: block.id, type: blockType(block), content: block.content, metadata: { legacyType: block.type, title: block.title, images: block.images, figureIds: block.figureIds, diagramSpec: block.diagramSpec } })) };
}

export function normalizeLectureDocument(raw: unknown): LectureDocument | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const blocks = (raw as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks)) return undefined;
  const normalized = blocks.flatMap((value, index): LectureDocumentBlock[] => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : `lecture-block-${index + 1}`;
    const type = VALID_TYPES.has(item.type as LectureDocumentBlockType) ? item.type as LectureDocumentBlockType : "paragraph";
    return [{ id, type, content: typeof item.content === "string" ? item.content : undefined, level: item.level === 2 || item.level === 3 ? item.level : 1, figureId: typeof item.figureId === "string" ? item.figureId : undefined, conceptId: typeof item.conceptId === "string" ? item.conceptId : undefined, metadata: item.metadata && typeof item.metadata === "object" ? item.metadata as Record<string, unknown> : undefined }];
  });
  return { blocks: normalized };
}

export function getLectureDocument(entry: WrongAnswerEntry): LectureDocument {
  return entry.lectureDocument ?? projectLegacyLearningBlocks(entry.learningBlocks);
}

export function getLectureHeadings(document: LectureDocument) {
  return document.blocks.filter((block) => block.type === "heading").map((block) => ({ id: block.id, title: block.content?.trim() || "제목 없음", level: block.level ?? 1 }));
}

export interface LectureRelationDiagnostic {
  relation: LectureQuestionRelation;
  status: "valid" | "missing_entry" | "missing_question" | "missing_block";
}

export function lectureRelationKey(relation: Pick<LectureQuestionRelation, "questionEntryId" | "questionNumber" | "lectureBlockId">): string {
  return `${relation.questionEntryId}:${normalizeQuestionNumber(relation.questionNumber)}:${relation.lectureBlockId ?? "root"}`;
}

export function dedupeLectureQuestionRelations(relations: LectureQuestionRelation[]): LectureQuestionRelation[] {
  const seen = new Set<string>();
  return relations.filter((relation) => {
    const key = lectureRelationKey(relation);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function diagnoseLectureQuestionRelations(
  lecture: WrongAnswerEntry,
  entries: WrongAnswerEntry[],
): LectureRelationDiagnostic[] {
  const document = getLectureDocument(lecture);
  const blocks = new Set(document.blocks.map((block) => block.id));
  return (lecture.lectureQuestionRelations ?? []).map((relation) => {
    const target = entries.find((entry) => entry.id === relation.questionEntryId);
    if (!target) return { relation, status: "missing_entry" };
    const hasQuestion = getEntryQuestions(target).some((question) => normalizeQuestionNumber(question.questionNumber) === normalizeQuestionNumber(relation.questionNumber));
    if (!hasQuestion) return { relation, status: "missing_question" };
    if (relation.lectureBlockId && !blocks.has(relation.lectureBlockId)) return { relation, status: "missing_block" };
    return { relation, status: "valid" };
  });
}
