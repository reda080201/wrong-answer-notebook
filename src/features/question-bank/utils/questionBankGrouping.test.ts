import { describe, expect, it } from "vitest";
import type { QuestionBankItem } from "../model/questionBankTypes";
import { groupQuestionBankItems } from "./questionBankGrouping";

const item = (id: string, unit?: string, sourceLabel?: string, updatedAt = "2026-01-01") => ({
  id, entryId: id, entryTitle: `자료 ${id}`, entryKind: "problem_sheet", questionNumber: id,
  subject: "수학", questionText: id, source: { type: "past_exam", sourceLabel },
  classification: { unit }, questionImages: [], sourcePageImages: [],
  hasAnswer: true, hasExplanation: true, hasImages: false, isWrong: false, isImportant: id === "2", isMastered: false,
  reviewDue: false, updatedAt,
} satisfies QuestionBankItem);

describe("groupQuestionBankItems", () => {
  it("projects the same items by unit and source without duplication", () => {
    const items = [item("10", "미분", "지인선 N제"), item("2", "적분", "지인선 N제"), item("1")];
    expect(groupQuestionBankItems(items, "unit").map((group) => [group.label, group.items.length])).toEqual([
      ["미분류", 1], ["미분", 1], ["적분", 1],
    ]);
    expect(groupQuestionBankItems(items, "source").map((group) => group.items.length)).toEqual([1, 2]);
    expect(groupQuestionBankItems(items, "unit").flatMap((group) => group.items)).toHaveLength(items.length);
  });

  it("keeps only explicitly important items in important view", () => {
    expect(groupQuestionBankItems([item("1"), item("2")], "important")[0].items.map((entry) => entry.id)).toEqual(["2"]);
  });
});
