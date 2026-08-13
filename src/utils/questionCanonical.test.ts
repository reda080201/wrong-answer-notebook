import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../types";
import { diagnoseQuestionSources, reconcileEntryQuestions } from "./questionCanonical";
import { stripLegacyChoiceSeparator } from "./legacyChoiceSeparator";
import { normalizeEntry } from "./entry";
import { createExamSession } from "../features/exam/services/examSession";

const base = { id: "k7", title: "K7", subject: "math", entryKind: "problem_sheet", createdAt: "2026-01-01", updatedAt: "2026-01-01", tags: [], checklist: [], concepts: [], questionImages: [], sourcePageImages: [], explanationParts: [] } as unknown as WrongAnswerEntry;

describe("canonical question reconciliation", () => {
  it("repairs only exact missing flat questions from a 27/30 persisted shape", () => {
    const question = Array.from({ length: 30 }, (_, index) => `${index + 1}. body ${index + 1}\n① choice`).join("\n\n");
    const entry = { ...base, question, structuredQuestions: Array.from({ length: 27 }, (_, index) => ({ questionNumber: String(index + 1), questionText: `body ${index + 1}`, conditions: [], equations: [], choices: ["① choice"], contentSegments: [], figureIds: [] })), answerKey: Array.from({ length: 30 }, (_, index) => ({ id: `a-${index}`, questionNumber: String(index + 1), answer: "①", explanation: "", importantPoints: [] })), questionMeta: [] } as WrongAnswerEntry;
    expect(diagnoseQuestionSources(entry).missingStructuredNumbers).toEqual(["28", "29", "30"]);
    const result = reconcileEntryQuestions(entry);
    expect(result.repairedNumbers).toEqual(["28", "29", "30"]);
    expect(result.entry.structuredQuestions?.map((item) => item.questionNumber)).toEqual(Array.from({ length: 30 }, (_, index) => String(index + 1)));
    const reloaded = normalizeEntry(structuredClone(entry));
    expect(reloaded.structuredQuestions?.map((item) => item.questionNumber)).toEqual(Array.from({ length: 30 }, (_, index) => String(index + 1)));
    expect(createExamSession(reloaded).questions.map((item) => item.questionNumber)).toEqual(Array.from({ length: 30 }, (_, index) => String(index + 1)));
  });

  it("does not invent content when compatibility text cannot recover it", () => {
    const entry = { ...base, question: "1. only", structuredQuestions: [{ questionNumber: "1", questionText: "only", conditions: [], equations: [], choices: [], contentSegments: [], figureIds: [] }], answerKey: [{ id: "a", questionNumber: "2", answer: "1", explanation: "", importantPoints: [] }], questionMeta: [] } as WrongAnswerEntry;
    const result = reconcileEntryQuestions(entry);
    expect(result.changed).toBe(false);
    expect(result.unresolvedNumbers).toEqual(["2"]);
  });
});

describe("legacy choice separators", () => {
  it.each([["\u2460 \\frac{3}{4} /", "\u2460 \\frac{3}{4}"], ["\u2462 3 /", "\u2462 3"], ["\u2463 6 /", "\u2463 6"]])("cleans %s", (input, expected) => expect(stripLegacyChoiceSeparator(input)).toBe(expected));
  it.each(["3/4", "x/y", "1/(x+1)", "\\frac{3}{4}", "a/b+c"])("preserves %s", (input) => expect(stripLegacyChoiceSeparator(input)).toBe(input));
});
