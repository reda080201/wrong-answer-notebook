import { v4 as uuidv4 } from "uuid";
import type { ExamMode, ExamSession, GeneratedExam } from "../../../types";
import { migrateQuestionSource } from "./questionSource";

export function createSessionFromGeneratedExam(exam: GeneratedExam, now = new Date(), options: { mode?: ExamMode; timeLimitMinutes?: number; showTimer?: boolean; answerSheetOpen?: boolean } = {}): ExamSession {
  const mode = options.mode === "real" ? "real" : "practice";
  const timeLimitMinutes = mode === "real" ? options.timeLimitMinutes ?? exam.timeLimitMinutes : undefined;
  const startedAt = now.toISOString();
  return { id: uuidv4(), entryId: `generated:${exam.id}`, title: exam.title, subject: exam.subject, status: "in_progress", mode, timeLimitMinutes, deadlineAt: timeLimitMinutes ? new Date(now.getTime() + timeLimitMinutes * 60_000).toISOString() : undefined, showTimer: mode === "real" ? options.showTimer !== false : undefined, answerSheetOpen: mode === "real" ? options.answerSheetOpen !== false : undefined, questions: exam.questions.map((question) => { const source = question.source ?? migrateQuestionSource(question, []).source; return { ...structuredClone(question.snapshot), generatedExamId: exam.id, sourceEntryId: source.sourceEntryId, sourceQuestionNumber: source.sourceQuestionNumber, generatedQuestionPosition: question.position }; }), responses: [], currentQuestionIndex: 0, startedAt, updatedAt: startedAt };
}
