import { afterEach, describe, expect, it } from "vitest";
import { applyBrowserBackupAtomically } from "./backup";
import { DEFAULT_SETTINGS } from "./settings";

const payload = () => ({
  meta: { version: 1 as const, createdAt: "2026-10-13T00:00:00.000Z", source: "browser" as const },
  entries: [], settings: DEFAULT_SETTINGS, browserImages: {} as Record<string, string>,
});
const snapshot = () => Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]));
afterEach(() => localStorage.clear());

describe("v1 backup images used by retained stores", () => {
  it.each([
    ["wrong-answer-exam-sessions", [{ id: "exam", questions: [{ questionImages: ["retained.png"] }] }]],
    ["wrong-answer-generated-exams", [{ questions: [{ snapshot: { sourcePageImages: ["retained.png"] } }] }]],
    ["wrong-answer-gpt-solution-roundtrip-drafts", [{ questionSnapshot: { questions: [{ questionImages: ["retained.png"] }] } }]],
    ["wrong-answer-import-workspace-draft", { groups: [{ questions: [] }], assets: [{ filename: "retained.png" }] }],
    ["wrong-answer-pending-deletions", [{ id: "pending", imageReferences: ["retained.png"] }]],
  ])("preserves the image referenced by %s", async (key, value) => {
    localStorage.setItem(key as string, JSON.stringify(value));
    localStorage.setItem("img_retained.png", "original-image");
    localStorage.setItem("img_unreferenced.png", "old-unused-image");
    await applyBrowserBackupAtomically(payload());
    expect(localStorage.getItem(key as string)).toBe(JSON.stringify(value));
    expect(localStorage.getItem("img_retained.png")).toBe("original-image");
    expect(localStorage.getItem("img_unreferenced.png")).toBeNull();
  });

  it("rejects a name collision before changing any store", async () => {
    localStorage.setItem("wrong-answer-exam-sessions", JSON.stringify([{ questions: [{ sourcePageImages: ["retained.png"] }] }]));
    localStorage.setItem("img_retained.png", "original-image");
    const before = snapshot();
    await expect(applyBrowserBackupAtomically({ ...payload(), browserImages: { "img_retained.png": "different-backup-image" } })).rejects.toThrow("충돌");
    expect(snapshot()).toEqual(before);
  });

  it("accepts the same image in both the backup and retained stores", async () => {
    localStorage.setItem("wrong-answer-exam-sessions", JSON.stringify([{ questions: [{ questionImages: ["retained.png"] }] }]));
    localStorage.setItem("img_retained.png", "same-image");
    await applyBrowserBackupAtomically({ ...payload(), browserImages: { "img_retained.png": "same-image" } });
    expect(localStorage.getItem("img_retained.png")).toBe("same-image");
  });

  it.each(["{", '{"not":"an array"}', '[{"questions":"lost references"}]'])("rejects unreadable retained references: %s", async raw => {
    localStorage.setItem("wrong-answer-exam-sessions", raw);
    localStorage.setItem("img_retained.png", "original-image");
    const before = snapshot();
    await expect(applyBrowserBackupAtomically(payload())).rejects.toThrow("이미지 참조");
    expect(snapshot()).toEqual(before);
  });

  it("blocks restore when a retained image is absent from both sources", async () => {
    localStorage.setItem("wrong-answer-exam-sessions", JSON.stringify([{ questions: [{ questionImages: ["missing.png"] }] }]));
    const before = snapshot();
    await expect(applyBrowserBackupAtomically(payload())).rejects.toThrow("missing.png");
    expect(snapshot()).toEqual(before);
  });

  it("does not preserve references belonging only to entries being replaced", async () => {
    localStorage.setItem("wrong-answer-entries", JSON.stringify({ entries: [{ questionImages: ["old-entry.png"] }] }));
    localStorage.setItem("img_old-entry.png", "old-entry-image");
    await applyBrowserBackupAtomically(payload());
    expect(localStorage.getItem("img_old-entry.png")).toBeNull();
  });
});
