import type { LearningSubjectDomain } from "./learning";

export type StudyItemKind = "learning_block" | "question";
export type StudyReviewResult = "again" | "hard" | "known";

export interface StudyItemReference {
  id: string;
  kind: StudyItemKind;
  entryId: string;
  blockId?: string;
  questionNumber?: string;
  subjectDomain?: LearningSubjectDomain;
}

export interface StudyReviewEvent {
  id: string;
  itemId: string;
  result: StudyReviewResult;
  reviewedAt: string;
}

/** A manual study queue. It deliberately contains references, never copied content or SRS fields. */
export interface StudySession {
  id: string;
  title: string;
  scope: "learning-hub" | "question-bank" | "problem-sheet";
  itemRefs: StudyItemReference[];
  currentIndex: number;
  reviewEvents: StudyReviewEvent[];
  createdAt: string;
  updatedAt: string;
  status: "in_progress" | "completed";
}
