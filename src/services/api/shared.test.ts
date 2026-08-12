import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../../types";
import { parseStoredEntries } from "./shared";

function entry(id: string, partial: Partial<WrongAnswerEntry> = {}): WrongAnswerEntry {
  return {
    id,
    subject: "수학",
    title: id,
    question: "12. legacy body",
    questionImages: [],
    entryKind: "problem_sheet",
    difficult: false,
    myAnswer: "",
    correctAnswer: "",
    explanationParts: [],
    memo: "",
    annotations: [],
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    mastered: false,
    ...partial,
  };
}

describe("parseStoredEntries", () => {
  it("quarantines one malformed structured entry without blocking healthy entries", () => {
    const malformedRaw = [{ questionNumber: "12" }];
    const entries = parseStoredEntries({
      schemaVersion: 2,
      entries: [
        entry("broken", { structuredQuestions: malformedRaw as never }),
        entry("healthy"),
      ],
    });

    expect(entries.map((item) => item.id)).toEqual(["broken", "healthy"]);
    expect(entries[0].structuredQuestions).toBeUndefined();
    expect(entries[0].structuredQuestionsRecovery?.raw).toEqual(malformedRaw);
    expect(entries[1].structuredQuestionsRecovery).toBeUndefined();
  });

  it("clears recovery metadata when valid structured data replaces it", () => {
    const [normalized] = parseStoredEntries({
      schemaVersion: 2,
      entries: [entry("repaired", {
        structuredQuestions: [{
          questionNumber: "1",
          questionText: "repaired",
          conditions: [],
          equations: [],
          choices: [],
          contentSegments: [],
          figureIds: [],
        }],
        structuredQuestionsRecovery: {
          raw: [{ questionNumber: "1" }],
          issues: [{ index: 0, questionNumber: "1", code: "missing_text", message: "missing" }],
        },
      })],
    });

    expect(normalized.structuredQuestions?.[0].questionText).toBe("repaired");
    expect(normalized.structuredQuestionsRecovery).toBeUndefined();
  });
});
