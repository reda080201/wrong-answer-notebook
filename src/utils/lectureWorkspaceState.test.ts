import { describe, expect, it } from "vitest";
import { consumeLectureWorkspaceFocus, loadLectureWorkspaceState, requestLectureWorkspaceFocus, saveLectureWorkspaceState } from "./lectureWorkspaceState";

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
}

describe("lecture workspace state", () => {
  it("persists panel state and scroll position separately from lecture data", () => {
    const storage = memoryStorage();
    saveLectureWorkspaceState("lecture-1", { outlineOpen: false, relatedOpen: true, scrollTop: 240 }, storage);
    expect(loadLectureWorkspaceState("lecture-1", storage)).toMatchObject({ outlineOpen: false, relatedOpen: true, scrollTop: 240 });
  });

  it("keeps only the most recent 100 lecture states", () => {
    const storage = memoryStorage();
    for (let index = 0; index < 101; index += 1) saveLectureWorkspaceState(`lecture-${index}`, { scrollTop: index }, storage);
    expect(loadLectureWorkspaceState("lecture-0", storage)).toBeUndefined();
    expect(loadLectureWorkspaceState("lecture-100", storage)?.scrollTop).toBe(100);
  });

  it("delivers a requested block focus once to the matching lecture", () => {
    const storage = memoryStorage();
    requestLectureWorkspaceFocus({ entryId: "lecture-2", blockId: "block-b" }, storage);
    expect(consumeLectureWorkspaceFocus("lecture-1", storage)).toBeUndefined();
    expect(consumeLectureWorkspaceFocus("lecture-2", storage)).toEqual({ entryId: "lecture-2", blockId: "block-b" });
    expect(consumeLectureWorkspaceFocus("lecture-2", storage)).toBeUndefined();
  });
});
