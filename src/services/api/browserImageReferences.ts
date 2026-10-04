import type { WrongAnswerEntry } from "../../types";
import { EXAM_SESSIONS_STORAGE_KEY } from "../../features/exam/storage/examSessionStorage";
import { GENERATED_EXAMS_STORAGE_KEY } from "../../features/exam-builder/storage/generatedExamStorage";
import { GPT_SOLUTION_ROUNDTRIP_DRAFTS_STORAGE_KEY } from "../../features/gpt-solution-roundtrip/storage/gptSolutionRoundtripStorage";
import { getAllImageFilenames } from "../../utils/entry";
import { readStorageJson } from "../storageJson";
import { ENTRIES_STORAGE_KEY, isUnknownStorageValue, parseStoredEntries } from "./shared";

const BROWSER_IMAGE_REFERENCE_KEYS = [
  EXAM_SESSIONS_STORAGE_KEY,
  GENERATED_EXAMS_STORAGE_KEY,
  GPT_SOLUTION_ROUNDTRIP_DRAFTS_STORAGE_KEY,
  "wrong-answer-import-workspace-draft",
  "wrong-answer-pending-deletions",
] as const;

function collectImageFilenames(value: unknown, referenced: Set<string>): void {
  if (typeof value === "string") {
    if (/^[^/\\:]{1,255}\.(?:png|jpe?g|gif|webp)$/i.test(value) && !value.includes("..")) referenced.add(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectImageFilenames(item, referenced));
  } else if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => collectImageFilenames(item, referenced));
  }
}

export function getBrowserProtectedImageReferences(
  entries: WrongAnswerEntry[],
  options: { excludePendingDeletionIds?: readonly string[] } = {},
): Set<string> {
  const referenced = new Set(entries.flatMap(getAllImageFilenames));
  const excluded = new Set(options.excludePendingDeletionIds ?? []);
  for (const key of BROWSER_IMAGE_REFERENCE_KEYS) {
    const stored = localStorage.getItem(key);
    if (!stored) continue;
    let value: unknown;
    try {
      value = JSON.parse(stored);
    } catch (cause) {
      throw new Error(`저장된 이미지 참조(${key})를 읽지 못했습니다.`, { cause });
    }
    if (key === "wrong-answer-pending-deletions" && Array.isArray(value)) {
      value = value.filter((record) => !record || typeof record !== "object" || !excluded.has(String((record as { id?: unknown }).id ?? "")));
    }
    collectImageFilenames(value, referenced);
  }
  return referenced;
}

export function loadBrowserEntriesForImageReferences(): WrongAnswerEntry[] {
  const stored = readStorageJson(localStorage, ENTRIES_STORAGE_KEY, isUnknownStorageValue);
  return stored === null ? [] : parseStoredEntries(stored);
}
