import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ExamSession, GeneratedExam } from "../../types";
import {
  loadExamSessions as loadExamSessionsFromStorage,
  saveExamSessions as saveExamSessionsToStorage,
} from "../../features/exam/storage/examSessionStorage";
import {
  loadGeneratedExams as loadGeneratedExamsFromStorage,
  saveGeneratedExams as saveGeneratedExamsToStorage,
} from "../../features/exam-builder/storage/generatedExamStorage";
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
    if (isTauri()) {
      return requireArray<ExamSession>(await invoke<unknown>("load_exam_sessions"), EXAM_SESSION_SHAPE_ERROR).map(normalizeExamSession);
    }
    reconcileBrowserExamSubmissionJournal();
    return loadExamSessionsFromStorage();
  } catch (error) {
    throw new Error(errorMessage(error, "모의고사 세션을 불러오지 못했습니다."), {
      cause: error,
    });
  }
}

export async function saveExamSessions(sessions: ExamSession[]): Promise<void> {
  try {
    requireArray<ExamSession>(sessions, EXAM_SESSION_SHAPE_ERROR);
    if (isTauri()) {
      await invoke("save_exam_sessions", { sessions });
      return;
    }
    saveExamSessionsToStorage(sessions);
  } catch (error) {
    throw new Error(errorMessage(error, "모의고사 세션을 저장하지 못했습니다."), {
      cause: error,
    });
  }
}

export async function loadGeneratedExams(): Promise<GeneratedExam[]> {
  try {
    if (isTauri()) return requireArray<GeneratedExam>(await invoke<unknown>("load_generated_exams"), GENERATED_EXAM_SHAPE_ERROR);
    return loadGeneratedExamsFromStorage();
  } catch (error) {
    throw new Error(errorMessage(error, "생성 모의고사를 불러오지 못했습니다."), { cause: error });
  }
}

export async function saveGeneratedExams(exams: GeneratedExam[]): Promise<void> {
  try {
    requireArray<GeneratedExam>(exams, GENERATED_EXAM_SHAPE_ERROR);
    if (isTauri()) { await invoke("save_generated_exams", { exams }); return; }
    saveGeneratedExamsToStorage(exams);
  } catch (error) {
    throw new Error(errorMessage(error, "생성 모의고사를 저장하지 못했습니다."), { cause: error });
  }
}
