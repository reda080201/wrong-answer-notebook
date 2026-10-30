import { describe, expect, it } from "vitest";
import { getEntryTitle } from "./entry";
import { createEmptyEntryDraft } from "../features/entries/model/entryDraft";
import { createQuestionSource } from "../features/exam-builder/services/questionSource";

describe("display titles", () => {
  const entry = { ...createEmptyEntryDraft(), id: "title", createdAt: "", updatedAt: "" };
  it("keeps an explicit title and uses readable text without cutting LaTeX", () => {
    expect(getEntryTitle({ ...entry, title: "사용자 제목", question: "$x$" })).toBe("사용자 제목");
    expect(getEntryTitle({ ...entry, question: "수열의 합 $\\sum_{k=1}^n k$" })).toBe("수열의 합");
    expect(getEntryTitle({ ...entry, question: "$\\frac{1}{2}$" })).toBe("수식이 포함된 오답");
    expect(createQuestionSource({ ...entry, question: "본문 요약" }, "1", { question: "본문 요약", choices: [] }).sourceEntryTitle).toBe("본문 요약");
  });
});
