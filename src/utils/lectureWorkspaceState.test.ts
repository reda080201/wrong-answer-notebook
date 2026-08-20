import { describe, expect, it } from "vitest";
import { loadLectureWorkspaceState, saveLectureWorkspaceState } from "./lectureWorkspaceState";

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
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
});
