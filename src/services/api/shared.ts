import type { WrongAnswerEntry } from "../../types";
import { normalizeEntry } from "../../utils/entry";
import { toAppError } from "../appError";

export const ENTRIES_STORAGE_KEY = "wrong-answer-entries";
export const SETTINGS_STORAGE_KEY = "wrong-answer-settings";
export const ENTRIES_SCHEMA_VERSION = 2;

export interface StoredEntriesDocument {
  schemaVersion: number;
  entries: unknown[];
}

export function isUnknownStorageValue(value: unknown): value is unknown {
  return value === value;
}

export function parseStoredEntries(parsed: unknown): WrongAnswerEntry[] {
  const entries = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && "entries" in parsed && Array.isArray(parsed.entries)
      ? (parsed as StoredEntriesDocument).entries
      : null;
  if (!entries) throw new Error("저장 데이터 형식이 올바르지 않습니다.");
  return entries.map((entry) => normalizeEntry(entry as WrongAnswerEntry));
}

export function errorMessage(error: unknown, fallback: string): string {
  return toAppError(error, fallback).message;
}
