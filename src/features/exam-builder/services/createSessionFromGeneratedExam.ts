import { v4 as uuidv4 } from "uuid";
import type { ExamMode, ExamSession, GeneratedExam } from "../../../types";
import { migrateQuestionSource } from "./questionSource";

export function createSessionFromGeneratedExam(exam: GeneratedExam, now = new Date(), options: { mode?: ExamMode; timeLimitMinutes?: number; showTimer?: boolean; answerSheetOpen?: boolean; answerSheetLayout?: "auto" | "vertical" | "horizontal" } = {}): ExamSession {
  const mode = options.mode === "real" ? "real" : "practice";
  const timeLimitMinutes = mode === "real" ? options.timeLimitMinutes ?? exam.timeLimitMinutes : undefined;
  const startedAt = now.toISOString();
  const questions = exam.questions.map((question) => { const source = question.source ?? migrateQuestionSource(question, []).source; const id = `${exam.id}-${question.position}`; return { ...structuredClone(question.snapshot), id, questionSolutionHotspots: question.snapshot.questionSolutionHotspots?.map(hotspot => ({ ...hotspot, id: `${id}-${hotspot.id}`, questionKey: id })), questionNumber: String(question.position), generatedExamId: exam.id, sourceEntryId: source.sourceEntryId, sourceQuestionNumber: source.sourceQuestionNumber, generatedQuestionPosition: question.position }; });
  const sourcePageImages = [...new Set(questions.flatMap((question) => question.sourcePageImages ?? []))];
  const explicitPages = new Map<string, string[]>();
  for (const question of questions) {
    const sourcePage = question.source?.page
      ? question.sourcePageImages?.[question.source.page - 1] ?? (question.sourcePageImages?.length === 1 ? question.sourcePageImages[0] : undefined)
      : undefined;
    const linkedPages = [
      sourcePage,
      ...(question.questionSolutionHotspots ?? []).map(hotspot => hotspot.sourcePageImage),
      ...(question.figures ?? []).map((figure) => figure.original?.sourcePageImage),
    ];
    for (const filename of linkedPages) {
      if (!filename || !sourcePageImages.includes(filename)) continue;
      const numbers = explicitPages.get(filename) ?? [];
      if (!numbers.includes(question.questionNumber)) numbers.push(question.questionNumber);
      explicitPages.set(filename, numbers);
    }
  }
  const sourcePageQuestionMap = Object.fromEntries(explicitPages);
  return { id: uuidv4(), entryId: `generated:${exam.id}`, title: exam.title, subject: exam.subject, status: "in_progress", mode, timeLimitMinutes, deadlineAt: timeLimitMinutes ? new Date(now.getTime() + timeLimitMinutes * 60_000).toISOString() : undefined, showTimer: mode === "real" ? options.showTimer !== false : undefined, answerSheetOpen: mode === "real" ? options.answerSheetOpen !== false : undefined, answerSheetLayout: mode === "real" ? options.answerSheetLayout ?? "auto" : undefined, questions, sourcePageImages, sourcePageQuestionMap, ...(mode === "real" ? { selectedSourcePageImages: sourcePageImages.filter(filename => sourcePageQuestionMap[filename]?.length) } : {}), responses: [], currentQuestionIndex: 0, startedAt, updatedAt: startedAt };
}
