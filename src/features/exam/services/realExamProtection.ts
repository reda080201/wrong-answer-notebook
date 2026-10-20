import { useSyncExternalStore } from "react";
import type { ExamSession, GeneratedExam, WrongAnswerEntry } from "../../../types";
import { normalizeQuestionNumber } from "../../../utils/questionNumber";
import { hydrateSessionSourceReferences } from "../../exam-builder/services/questionSource";

let active: ExamSession | null = null;
let saved: ExamSession[] = [];
let entries: WrongAnswerEntry[] = [];
let generatedExams: GeneratedExam[] = [];
let unavailable = false;
const listeners = new Set<() => void>();
let snapshot = { sourceIds: new Set<string>(), sessions: [] as ExamSession[], unavailable: false };
let signature = "";

function publish() {
  // The live terminal state wins over a debounced, older saved session.
  const byId = new Map(saved.map(session => [session.id, hydrateSessionSourceReferences(session, generatedExams)]));
  if (active) byId.set(active.id, hydrateSessionSourceReferences(active, generatedExams));
  const sessions = [...byId.values()].filter(session => session.mode === "real" && session.status === "in_progress");
  const sourceIds = new Set(sessions.flatMap(session => [session.entryId, ...session.questions.flatMap(question => [question.sourceReference?.sourceEntryId, question.sourceEntryId])]).filter((id): id is string => Boolean(id)));
  for (const exam of generatedExams) if (exam.questions.some(question => sourceIds.has(question.source?.sourceEntryId ?? question.sourceEntryId ?? ""))) sourceIds.add(`generated:${exam.id}`);
  for (const entry of entries) {
    const parent = entry.generatedFromExamSessionId ? byId.get(entry.generatedFromExamSessionId) : undefined;
    if (!parent) continue;
    const matches = parent.questions.filter(question => normalizeQuestionNumber(question.questionNumber) === normalizeQuestionNumber(entry.generatedFromQuestionNumber ?? ""));
    if (sessions.some(session => session.id === parent.id) || matches.some(question => sourceIds.has(question.sourceReference?.sourceEntryId ?? question.sourceEntryId ?? parent.entryId))) sourceIds.add(entry.id);
  }
  const nextSignature = JSON.stringify([unavailable, [...sourceIds].sort(), sessions.map(session => [session.id, session.title])]);
  if (nextSignature === signature) return;
  signature = nextSignature;
  snapshot = { sourceIds, sessions, unavailable };
  for (const listener of listeners) listener();
}

export function setActiveRealExamProtection(session: ExamSession | null) { active = session; publish(); }
export function setSavedRealExamProtection(sessions: ExamSession[], cannotRead = false, sourceEntries: WrongAnswerEntry[] = [], exams: GeneratedExam[] = []) {
  saved = sessions; unavailable = cannotRead; entries = sourceEntries; generatedExams = exams; publish();
}
export function subscribeRealExamProtection(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function getRealExamProtection() { return snapshot; }
export function useRealExamProtection() { return useSyncExternalStore(subscribeRealExamProtection, getRealExamProtection, getRealExamProtection); }
export function assertRealExamSourcesAllowed(sourceIds: readonly string[]) {
  if (sourceIds.length && snapshot.unavailable) throw new Error("실전 시험 기록을 확인하지 못해 자료 공유를 잠시 차단했습니다. 시험 기록을 다시 불러오세요.");
  if (sourceIds.some(id => snapshot.sourceIds.has(id))) throw new Error("진행 중 실전 시험 자료는 제출 후 확인·공유할 수 있습니다. 시험을 닫아도 보호는 유지됩니다.");
}
export function assertRealExamSessionAllowed(sessionId: string | null) {
  if (sessionId && (snapshot.unavailable || snapshot.sessions.some(session => session.id === sessionId))) throw new Error("진행 중 실전 시험 자료는 제출 후 공유할 수 있습니다.");
}
