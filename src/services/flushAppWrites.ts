import type { ExamSession } from "../types";

export const APP_CLOSE_FLUSH_TIMEOUT_MS = 15_000;

export async function flushPendingAppWrites(options: {
  activeExam: ExamSession | null;
  flushExamSession: (session: ExamSession) => Promise<boolean>;
  flushEntries: () => Promise<void>;
  flushGeneratedExams: () => Promise<void>;
  flushSettings: () => Promise<void>;
  flushImportWorkspaceDraft: () => Promise<void>;
  flushLibraryFolders: () => Promise<void>;
  flushGptSolutionDrafts?: () => Promise<void>;
  timeoutMs?: number;
}): Promise<void> {
  const flush = async () => {
    if (options.activeExam && !(await options.flushExamSession(options.activeExam))) {
      throw new Error("시험 진행 상태를 저장하지 못했습니다.");
    }
    await Promise.all([
      options.flushEntries(),
      options.flushGeneratedExams(),
      options.flushSettings(),
      options.flushImportWorkspaceDraft(),
      options.flushLibraryFolders(),
      options.flushGptSolutionDrafts?.(),
    ]);
  };
  const timeoutMs = options.timeoutMs ?? APP_CLOSE_FLUSH_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      flush(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("저장 시간이 초과되었습니다. 저장 상태를 확인한 뒤 다시 시도해 주세요.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
