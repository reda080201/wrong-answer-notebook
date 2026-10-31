import { afterEach, describe, expect, it, vi } from "vitest";
import { backupFilename } from "./backupFilename";

function localDatePart(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("backupFilename", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the local calendar date for zip and json backup names", () => {
    vi.stubEnv("TZ", "Asia/Seoul");
    const now = new Date(2026, 0, 2, 0, 5);
    const datePart = localDatePart(now);

    expect(datePart).toBe("2026-01-02");
    expect(now.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(backupFilename("zip", now)).toBe(`wrong-answer-backup-${datePart}.zip`);
    expect(backupFilename("json", now)).toBe(`wrong-answer-backup-${datePart}.json`);
  });

  it("works when the local and UTC calendar dates are the same", () => {
    vi.stubEnv("TZ", "UTC");
    const now = new Date(2026, 0, 2, 0, 5);
    const datePart = localDatePart(now);

    expect(datePart).toBe(now.toISOString().slice(0, 10));
    expect(backupFilename("zip", now)).toBe(`wrong-answer-backup-${datePart}.zip`);
    expect(backupFilename("json", now)).toBe(`wrong-answer-backup-${datePart}.json`);
  });
});
