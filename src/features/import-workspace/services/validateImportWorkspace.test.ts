import { describe, expect, it } from "vitest";
import { validateImportWorkspace } from "./validateImportWorkspace";
import type { ImportWorkspace } from "../model/importWorkspace";

const baseWorkspace = (questionText: string): ImportWorkspace => ({
  id: "workspace-1", createdAt: "2025-01-01", updatedAt: "2025-01-01", status: "review_required", revision: 0,
  sourceFiles: [], assets: [], unassignedBlocks: [], excludedBlocks: [], warnings: [],
  groups: [{ id: "group-1", title: "1회", questions: [{ id: "question-1", groupId: "group-1", order: 0, displayQuestionNumber: "1", sourceQuestionNumber: "1", contentSegments: [{ id: "segment-1", type: "text", text: questionText }], choices: [], figures: [], questionImageAssets: [], sourcePageAssets: [], explanationParts: [], sourceReferences: [], status: "ready", warnings: [] }], answerItems: [], sourceFileIds: [], userConfirmed: true }],
});

describe("import workspace validation", () => {
  it("reports missing answer as warning, not fatal", () => {
    const issues = validateImportWorkspace(baseWorkspace("문제 본문"));
    expect(issues.some((issue) => issue.severity === "warning" && issue.message.includes("정답"))).toBe(true);
    expect(issues.some((issue) => issue.severity === "error")).toBe(false);
  });

  it("blocks empty question content", () => {
    const issues = validateImportWorkspace(baseWorkspace(""));
    expect(issues.some((issue) => issue.severity === "error")).toBe(true);
  });
});

