import type { StudySession } from "../../types";
import { getStorageBackend } from "../storageBackend";
import { errorMessage } from "./shared";

function requireStudySessions(value: unknown): StudySession[] {
  if (!Array.isArray(value)) throw new Error("학습 세션 저장 형식이 올바르지 않습니다. 배열이어야 합니다.");
  return value as StudySession[];
}

export async function loadStudySessions(): Promise<StudySession[]> {
  try {
    const loader = getStorageBackend().loadStudySessions;
    return loader ? requireStudySessions(await loader()) : [];
  } catch (error) {
    throw new Error(errorMessage(error, "학습 세션을 불러오지 못했습니다."), { cause: error });
  }
}

export async function saveStudySessions(sessions: StudySession[]): Promise<void> {
  try {
    const saver = getStorageBackend().saveStudySessions;
    if (!saver) throw new Error("현재 저장소는 학습 세션을 지원하지 않습니다.");
    await saver(requireStudySessions(sessions));
  } catch (error) {
    throw new Error(errorMessage(error, "학습 세션을 저장하지 못했습니다."), { cause: error });
  }
}
