export type LectureDocumentBlockType =
  | "heading" | "paragraph" | "math" | "image" | "figure" | "table"
  | "quote" | "callout" | "example" | "warning" | "collapsible"
  | "related_concept" | "related_question";

export interface LectureDocumentBlock {
  id: string;
  type: LectureDocumentBlockType;
  content?: string;
  level?: 1 | 2 | 3;
  figureId?: string;
  conceptId?: string;
  metadata?: Record<string, unknown>;
}

export interface LectureDocument {
  blocks: LectureDocumentBlock[];
}

export interface LectureQuestionRelation {
  id: string;
  questionEntryId: string;
  questionNumber: string;
  lectureBlockId?: string;
  createdAt: string;
}
