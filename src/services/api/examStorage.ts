import type { ExamSession, GeneratedExam } from "../../types";
import { getStorageBackend } from "../storageBackend";
import { errorMessage } from "./shared";
import { reconcileBrowserExamSubmissionJournal } from "./examSubmission";
import { normalizeExamSession } from "../../features/exam/storage/examSessionStorage";

const EXAM_SESSION_SHAPE_ERROR = "모의고사 세션 저장 형식이 올바르지 않습니다. 배열이어야 합니다.";
const GENERATED_EXAM_SHAPE_ERROR = "생성 모의고사 저장 형식이 올바르지 않습니다. 배열이어야 합니다.";

function requireArray<T>(value: unknown, errorMessageText: string): T[] {
  if (!Array.isArray(value)) throw new Error(errorMessageText);
  return value as T[];
}

export async function loadExamSessions(): Promise<ExamSession[]> {
  try {
    const backend = getStorageBackend();
    if (backend.kind === "isolated-browser") reconcileBrowserExamSubmissionJournal();
    return requireArray<ExamSession>(await backend.loadExamSessions(), EXAM_SESSION_SHAPE_ERROR).map(normalizeExamSession);
  } catch (error) {
    throw new Error(errorMessage(error, "모의고사 세션을 불러오지 못했습니다."), {
      cause: error,
    });
  }
}

export async function saveExamSessions(sessions: ExamSession[]): Promise<void> {
  try {
    requireArray<ExamSession>(sessions, EXAM_SESSION_SHAPE_ERROR);
    await getStorageBackend().saveExamSessions(sessions);
  } catch (error) {
    throw new Error(errorMessage(error, "모의고사 세션을 저장하지 못했습니다."), {
      cause: error,
    });
  }
}

export async function loadGeneratedExams(): Promise<GeneratedExam[]> {
  try {
    return requireArray<GeneratedExam>(await getStorageBackend().loadGeneratedExams(), GENERATED_EXAM_SHAPE_ERROR);
  } catch (error) {
    throw new Error(errorMessage(error, "생성 모의고사를 불러오지 못했습니다."), { cause: error });
  }
}

export async function saveGeneratedExams(exams: GeneratedExam[]): Promise<void> {
  try {
    requireArray<GeneratedExam>(exams, GENERATED_EXAM_SHAPE_ERROR);
    await getStorageBackend().saveGeneratedExams(exams);
  } catch (error) {
    throw new Error(errorMessage(error, "생성 모의고사를 저장하지 못했습니다."), { cause: error });
  }
}
