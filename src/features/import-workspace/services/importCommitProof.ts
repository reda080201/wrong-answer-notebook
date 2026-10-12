import type { EntryFormData, WrongAnswerEntry } from "../../../types";
import { normalizeEntry } from "../../../utils/entry";

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)]));
  return value;
}

/** Compare the persisted normalized payload; timestamps are not import identity. */
export function importEntryPayload(entry: EntryFormData | WrongAnswerEntry): string {
  const normalized = normalizeEntry({ ...entry, id: "import-proof", createdAt: "2000-01-01T00:00:00.000Z", updatedAt: "2000-01-01T00:00:00.000Z" } as WrongAnswerEntry);
  return JSON.stringify(ordered(normalized));
}

export async function importEntryDigest(entry: EntryFormData | WrongAnswerEntry): Promise<string> {
  const bytes = new TextEncoder().encode(importEntryPayload(entry));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function validatePlannedIds(forms: EntryFormData[], ids?: string[]): void {
  if (ids === undefined) return;
  if (ids.length !== forms.length || new Set(ids).size !== ids.length || ids.some(id => typeof id !== "string" || !id.trim() || id !== id.trim())) throw new Error("가져오기 항목 수와 고정 ID를 확인해 주세요.");
}

export function classifyImportRetry(current: WrongAnswerEntry[], added: WrongAnswerEntry[]): "new" | "existing" {
  const found = added.map(entry => current.find(existing => existing.id === entry.id));
  if (found.every(entry => !entry)) return "new";
  if (found.some(entry => !entry)) throw new Error("가져오기 저장 결과가 일부만 확인되어 재저장을 중단했습니다.");
  if (found.some((entry, index) => importEntryPayload(entry!) !== importEntryPayload(added[index]))) throw new Error("같은 ID의 저장 내용이 확정 기록과 달라 재저장을 중단했습니다.");
  return "existing";
}
