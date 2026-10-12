import { afterEach, describe, expect, it } from "vitest";
import { getBrowserProtectedImageReferences, loadBrowserEntriesForImageReferences } from "./browserImageReferences";

afterEach(() => localStorage.clear());
describe("fail-closed image references", () => {
  it.each([
    ["wrong-answer-exam-sessions", { broken: "lost array" }],
    ["wrong-answer-exam-sessions", [{ questions: "lost questions" }]],
    ["wrong-answer-generated-exams", [{ questions: [null] }]],
    ["wrong-answer-gpt-solution-roundtrip-drafts", [{}]],
    ["wrong-answer-import-workspace-draft", {}],
    ["wrong-answer-pending-deletions", [{ id: "excluded", imageReferences: "lost" }]],
    ["wrong-answer-exam-sessions", [{ questions: [{ figures: "lost" }] }]],
    ["wrong-answer-exam-sessions", [{ questions: [{ questionImages: [1] }] }]],
  ])("rejects malformed %s before any exclusion", (key, value) => {
    localStorage.setItem(key as string, JSON.stringify(value));
    expect(() => getBrowserProtectedImageReferences([], { excludePendingDeletionIds: ["excluded"] })).toThrow("이미지 참조");
  });
  it("accepts supported empty stores and a null workspace draft", () => {
    for (const key of ["wrong-answer-exam-sessions", "wrong-answer-generated-exams", "wrong-answer-gpt-solution-roundtrip-drafts", "wrong-answer-pending-deletions"]) localStorage.setItem(key, "[]");
    localStorage.setItem("wrong-answer-import-workspace-draft", "null");
    expect(getBrowserProtectedImageReferences([]).size).toBe(0);
  });
  it("excludes only the confirmed record's self reference", () => {
    localStorage.setItem("wrong-answer-pending-deletions", JSON.stringify([
      { id: "a", imageReferences: ["self.png", "shared.png"] },
      { id: "b", imageReferences: ["shared.png"] },
    ]));
    expect([...getBrowserProtectedImageReferences([], { excludePendingDeletionIds: ["a"] })]).toEqual(["shared.png"]);
  });
  it("rejects malformed entries instead of normalizing away references", () => {
    localStorage.setItem("wrong-answer-entries", JSON.stringify({ schemaVersion: 2, entries: [{ questionImages: "lost" }] }));
    expect(loadBrowserEntriesForImageReferences).toThrow();
  });
});
