import { describe, expect, it } from "vitest";
import { UPDATE_AUTO_CHECK_INTERVAL_MS, UPDATE_STARTUP_DELAY_MS, GITHUB_RELEASES_URL } from "./appUpdater";

describe("updater policy", () => {
  it("uses the stable startup and interval policy", () => {
    expect(UPDATE_STARTUP_DELAY_MS).toBe(8000);
    expect(UPDATE_AUTO_CHECK_INTERVAL_MS).toBe(12 * 60 * 60 * 1000);
    expect(GITHUB_RELEASES_URL).toContain("github.com/reda080201/wrong-answer-notebook/releases");
  });
});

