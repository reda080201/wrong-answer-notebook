import type { ExamSession } from "../types";

export async function flushPendingAppWrites(options: {
  activeExam: ExamSession | null;
  flushExamSession: (session: ExamSession) => Promise<boolean>;
  flushEntries: () => Promise<void>;
  flushGeneratedExams: () => Promise<void>;
  flushSettings: () => Promise<void>;
  flushImportWorkspaceDraft: () => Promise<void>;
}): Promise<void> {
  if (options.activeExam && !(await options.flushExamSession(options.activeExam))) {
    throw new Error("시험 진행 상태를 저장하지 못했습니다.");
  }
  await Promise.all([
    options.flushEntries(),
    options.flushGeneratedExams(),
    options.flushSettings(),
    options.flushImportWorkspaceDraft(),
  ]);
}
