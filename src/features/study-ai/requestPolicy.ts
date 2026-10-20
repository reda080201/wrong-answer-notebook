import type { ExamSession } from "../../types";

let blockedSources = new Set<string>();
const listeners = new Set<() => void>();
export function setStudyAiSession(session: ExamSession | null) {
    const next = new Set(session?.mode === "real" && session.status === "in_progress"
        ? [session.entryId, ...session.questions.map(q => q.sourceReference?.sourceEntryId ?? q.sourceEntryId ?? session.entryId)] : []);
    if (next.size === blockedSources.size && [...next].every(id => blockedSources.has(id))) return;
    blockedSources = next;
    for (const listener of listeners) listener();
}
export function assertStudyAiSourcesAllowed(sourceIds: readonly string[]) {
    if (sourceIds.some(id => blockedSources.has(id))) throw new Error("진행 중 실전 시험 자료는 전송할 수 없습니다. 자료를 제거하고 새 문맥에서 대화하세요.");
}
export function watchStudyAiPolicy(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
