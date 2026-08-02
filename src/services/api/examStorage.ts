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

export async function loadExamSessions(): Promise<ExamSession[]> {
  try {
    if (isTauri()) {
      return await invoke<ExamSession[]>("load_exam_sessions");
    }
    return loadExamSessionsFromStorage();
  } catch (error) {
    throw new Error(errorMessage(error, "모의고사 세션을 불러오지 못했습니다."), {
      cause: error,
    });
  }
}

export async function saveExamSessions(sessions: ExamSession[]): Promise<void> {
  try {
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
    if (isTauri()) return await invoke<GeneratedExam[]>("load_generated_exams");
    return loadGeneratedExamsFromStorage();
  } catch (error) {
    throw new Error(errorMessage(error, "생성 모의고사를 불러오지 못했습니다."), { cause: error });
  }
}

export async function saveGeneratedExams(exams: GeneratedExam[]): Promise<void> {
  try {
    if (isTauri()) { await invoke("save_generated_exams", { exams }); return; }
    saveGeneratedExamsToStorage(exams);
  } catch (error) {
    throw new Error(errorMessage(error, "생성 모의고사를 저장하지 못했습니다."), { cause: error });
  }
}
