import { describe, expect, it } from "vitest";
import { resolveImportProcessingStatus } from "./importProcessingStatus";

describe("resolveImportProcessingStatus", () => {
  it("lets local validation override external ready", () => {
    expect(resolveImportProcessingStatus({ externalStatus: "ready", localNeedsReview: true })).toBe("needs_review");
    expect(resolveImportProcessingStatus({ externalStatus: "ready", localBlocking: true })).toBe("rejected");
  });

  it("does not turn external rejected or legacy review into ready", () => {
    expect(resolveImportProcessingStatus({ externalStatus: "rejected" })).toBe("rejected");
    expect(resolveImportProcessingStatus({ legacyNeedsReview: true })).toBe("needs_review");
  });
});
