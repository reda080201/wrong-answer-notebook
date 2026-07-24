import { describe, expect, it } from "vitest";
import { sanitizeReleaseNotes } from "./updateNotes";

describe("release notes sanitization", () => {
  it("removes executable markup and limits length", () => {
    expect(sanitizeReleaseNotes("<script>alert(1)</script><p>새 기능</p>")).toBe("alert(1)새 기능");
    expect(sanitizeReleaseNotes("x".repeat(20_000)).length).toBe(12_000);
  });
});

