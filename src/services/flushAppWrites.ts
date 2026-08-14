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
    const operations: Array<{ name: string; run: () => Promise<void> }> = [
      ...(options.activeExam
        ? [{
          name: "시험 진행 상태",
          run: async () => {
            if (!(await options.flushExamSession(options.activeExam!))) {
              throw new Error("시험 진행 상태를 저장하지 못했습니다.");
            }
          },
        }]
        : []),
      { name: "오답노트", run: options.flushEntries },
      { name: "생성 모의고사", run: options.flushGeneratedExams },
      { name: "설정", run: options.flushSettings },
      { name: "가져오기 작업", run: options.flushImportWorkspaceDraft },
      { name: "보관함 폴더", run: options.flushLibraryFolders },
      ...(options.flushGptSolutionDrafts
        ? [{ name: "GPT 해설 초안", run: options.flushGptSolutionDrafts }]
        : []),
    ];
    const results = await Promise.allSettled(operations.map(({ run }) => run()));
    const failedNames = results.flatMap((result, index) => result.status === "rejected"
      ? [operations[index].name]
      : []);
    if (failedNames.length) {
      throw new Error(`저장하지 못한 항목: ${failedNames.join(", ")}. 저장 상태를 확인한 뒤 다시 시도해 주세요.`);
    }
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
