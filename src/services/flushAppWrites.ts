import type { ExamSession } from "../types";

export const APP_CLOSE_FLUSH_TIMEOUT_MS = 15_000;

export async function flushPendingAppWrites(options: {
  activeExam: ExamSession | null;
  flushExamSession: (session: ExamSession) => Promise<boolean>;
  flushEntries: () => Promise<void>;
  flushGeneratedExams: () => Promise<void>;
  flushSettings: () => Promise<void>;
  flushImportWorkspaceDraft: () => Promise<void>;
}, timeoutMs = APP_CLOSE_FLUSH_TIMEOUT_MS): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const flush = async () => {
    if (options.activeExam && !(await options.flushExamSession(options.activeExam))) {
      throw new Error("시험 진행 상태를 저장하지 못했습니다.");
    }
    await Promise.all([
      options.flushEntries(),
      options.flushGeneratedExams(),
      options.flushSettings(),
      options.flushImportWorkspaceDraft(),
    ]);
  };
  try {
    await Promise.race([
      flush(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("저장 시간이 초과되었습니다.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
