import { v4 as uuidv4 } from "uuid";
import type { ExamSession, GeneratedExam } from "../../../types";
import { migrateQuestionSource } from "./questionSource";

export function createSessionFromGeneratedExam(exam: GeneratedExam, now = new Date()): ExamSession {
  return { id: uuidv4(), entryId: `generated:${exam.id}`, title: exam.title, subject: exam.subject, status: "in_progress", questions: exam.questions.map((question) => { const source = question.source ?? migrateQuestionSource(question, []).source; return { ...structuredClone(question.snapshot), generatedExamId: exam.id, sourceEntryId: source.sourceEntryId, sourceQuestionNumber: source.sourceQuestionNumber, generatedQuestionPosition: question.position }; }), responses: [], currentQuestionIndex: 0, startedAt: now.toISOString(), updatedAt: now.toISOString() };
}
