import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../../../types";
import { resolveExportQuestionNumbers } from "./resolveExportQuestionNumbers";

const baseEntry: WrongAnswerEntry = {
  id: "sheet-1",
  subject: "수학",
  title: "모의고사",
  question: "[문제 1] 첫 문제\n① A\n[문제 2] 두째 문제\n① C",
  questionImages: [],
  entryKind: "problem_sheet",
  difficult: false,
  difficulty: "none",
  myAnswer: "",
  correctAnswer: "",
  explanationParts: [],
  memo: "",
  annotations: [],
  tags: [],
  answerKey: [],
  figures: [],
  questionMeta: [{ questionNumber: "1", important: true, updatedAt: "2026-01-01T00:00:00.000Z" }, { questionNumber: "2", important: false, updatedAt: "2026-01-01T00:00:00.000Z" }],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  mastered: false,
};

describe("resolveExportQuestionNumbers", () => {
  it("returns all sheet questions for whole scope", () => {
    expect(resolveExportQuestionNumbers({ entry: baseEntry, scope: "whole" }).questionNumbers).toEqual(["1", "2"]);
  });
  it("parses manual ranges in sheet order", () => {
    expect(resolveExportQuestionNumbers({ entry: baseEntry, scope: "manual", manualInput: "2, 1" }).questionNumbers).toEqual(["1", "2"]);
  });
  it("returns only important questions", () => {
    expect(resolveExportQuestionNumbers({ entry: baseEntry, scope: "important" }).questionNumbers).toEqual(["1"]);
  });
  it("reports invalid manual numbers", () => {
    const result = resolveExportQuestionNumbers({ entry: baseEntry, scope: "manual", manualInput: "9" });
    expect(result.questionNumbers).toEqual([]);
    expect(result.invalidNumbers).toEqual(["9"]);
    expect(result.disabledReason).toContain("없습니다");
  });
});
