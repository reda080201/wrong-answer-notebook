import { describe, expect, it } from "vitest";
import { classifyImportRetry, importEntryPayload, validatePlannedIds } from "./importCommitProof";
import type { EntryFormData, WrongAnswerEntry } from "../../../types";

const entry = { id: "planned-a", title: "원본", question: "문제", entryKind: "problem_sheet", createdAt: "2026-01-01", updatedAt: "2026-01-01" } as WrongAnswerEntry;
describe("import commit identity", () => {
  it("acknowledges only all matching persisted payloads", () => {
    expect(classifyImportRetry([entry], [{ ...entry, updatedAt: "2026-02-01" }])).toBe("existing");
    expect(classifyImportRetry([], [entry])).toBe("new");
    expect(() => classifyImportRetry([entry], [entry, { ...entry, id: "b" }])).toThrow("일부");
    expect(() => classifyImportRetry([entry], [{ ...entry, title: "다른 내용" }])).toThrow("저장 내용");
  });
  it("rejects missing, duplicate, whitespace and mismatched IDs", () => {
    const forms = [entry, entry] as EntryFormData[];
    for (const ids of [[], ["a"], ["a", "a"], ["a", " "], ["a", " b"]]) expect(() => validatePlannedIds(forms, ids)).toThrow();
    expect(() => validatePlannedIds(forms, ["a", "b"])).not.toThrow();
  });
  it("compares normalized fields without dropping meaningful ordered content", () => {
    expect(importEntryPayload(entry)).toBe(importEntryPayload({ ...entry, updatedAt: "later" }));
    expect(importEntryPayload(entry)).not.toBe(importEntryPayload({ ...entry, question: "문제\n문제" }));
  });
});
