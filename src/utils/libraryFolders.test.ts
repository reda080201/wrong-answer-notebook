import { describe, expect, it } from "vitest";
import type { LibraryFolder } from "../types";
import { getFolderDescendantIds } from "./libraryFolders";

const folder = (id: string, parentId?: string): LibraryFolder => ({
  id,
  name: id,
  parentId,
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("getFolderDescendantIds", () => {
  it("returns every nested descendant and ignores unrelated folders", () => {
    const result = getFolderDescendantIds([
      folder("root"),
      folder("child", "root"),
      folder("grandchild", "child"),
      folder("other"),
    ], "root");

    expect([...result]).toEqual(["root", "child", "grandchild"]);
  });

  it("terminates safely when persisted parent references form a cycle", () => {
    const result = getFolderDescendantIds([
      folder("root", "child"),
      folder("child", "root"),
      folder("other", "missing"),
    ], "root");

    expect([...result]).toEqual(["root", "child"]);
  });
});
