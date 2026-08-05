import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../../../models/entry";
import {
  analyzeGptSolutionRoundtrip,
  applyGptSolutionRoundtrip,
  validateGptSolutionResponse,
} from "./gptSolutionRoundtrip";

const entry: WrongAnswerEntry = {
  id: "sheet-1",
  subject: "수학",
  title: "수학 문제지",
  entryKind: "problem_sheet",
  question: "1. 첫 문제\n2. 둘째 문제\n3. 셋째 문제",
  questionImages: [],
  difficult: false,
  myAnswer: "",
  correctAnswer: "",
  explanationParts: [],
  memo: "",
  annotations: [],
  tags: [],
  answerKey: [{
    id: "answer-1",
    questionNumber: "01",
    answer: "①",
    explanation: "기존 해설",
    strategy: "기존 전략",
    importantPoints: [],
    legacyMarker: "preserve me",
  } as NonNullable<WrongAnswerEntry["answerKey"]>[number]],
  learningBlocks: [{ id: "block-existing", type: "concept", title: "기존 개념", content: "기존 내용", sourceQuestionNumber: "1" }],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  mastered: false,
};

function validatedResponse(raw: unknown) {
  const result = validateGptSolutionResponse(raw, {
    entryId: entry.id,
    requestedQuestionNumbers: ["1", "3"],
    availableQuestionNumbers: ["1", "2", "3"],
  });
  expect(result.errors).toEqual([]);
  expect(result.response).toBeDefined();
  return result.response!;
}

describe("gptSolutionRoundtrip", () => {
  it("accepts selected answers only and warns about unrequested output", () => {
    const result = validateGptSolutionResponse({
      entryId: "sheet-1",
      questionNumbers: ["1번", "2", "03"],
      solutions: [
        { questionNumber: "1", answer: "②" },
        { questionNumber: "2", answer: "③" },
        { questionNumber: "3", strategy: "조건을 정리" },
      ],
    }, {
      entryId: entry.id,
      requestedQuestionNumbers: ["1", "3"],
      availableQuestionNumbers: ["1", "2", "3"],
    });

    expect(result.valid).toBe(true);
    expect(result.response?.solutions.map((solution) => solution.questionNumber)).toEqual(["1", "3"]);
    expect(result.warnings.join(" ")).toContain("2번");
    expect(result.discardedQuestionNumbers).toContain("2");
  });

  it("rejects duplicate normalized response question numbers", () => {
    const result = validateGptSolutionResponse({
      entryId: "sheet-1",
      questionNumbers: ["01", "1번"],
      solutions: [
        { questionNumber: "01", answer: "①" },
        { questionNumber: "1번", answer: "②" },
      ],
    }, {
      entryId: entry.id,
      requestedQuestionNumbers: ["1"],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("중복");
  });

  it("rejects an entryId that does not belong to the selected snapshot", () => {
    const result = validateGptSolutionResponse({
      entryId: "other-sheet",
      questionNumbers: ["1"],
      solutions: [{ questionNumber: "1", answer: "①" }],
    }, { entryId: entry.id, requestedQuestionNumbers: ["1"] });

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("entryId");
  });

  it("models conflicts with an existing-first default and fill for empty fields", () => {
    const response = validatedResponse({
      entryId: entry.id,
      questionNumbers: ["1", "3"],
      solutions: [
        { questionNumber: "1", answer: "②", explanation: "새 해설", steps: ["조건 확인"] },
        { questionNumber: "3", answer: "④", explanation: "새 문항 해설" },
      ],
    });
    const analysis = analyzeGptSolutionRoundtrip(entry, response, ["1", "3"]);
    const first = analysis.rows.find((row) => row.questionNumber === "1")!;
    const answer = first.fields.find((field) => field.field === "answer")!;
    const steps = first.fields.find((field) => field.field === "steps")!;
    const third = analysis.rows.find((row) => row.questionNumber === "3")!;

    expect(answer).toMatchObject({ status: "conflict", defaultResolution: "existing" });
    expect(steps).toMatchObject({ status: "fill", defaultResolution: "fill" });
    expect(third.fields.find((field) => field.field === "answer")).toMatchObject({ status: "new", defaultResolution: "incoming" });
  });

  it("applies only approved fields while preserving existing IDs and unknown fields", () => {
    const response = validatedResponse({
      entryId: entry.id,
      questionNumbers: ["1", "3"],
      solutions: [
        {
          questionNumber: "1",
          answer: "②",
          explanation: "새 해설",
          steps: ["조건 확인"],
          learningBlocks: [{ type: "concept", title: "핵심 개념", content: "조건을 먼저 본다." }],
        },
        { questionNumber: "3", answer: "④", explanation: "저장하면 안 되는 문항" },
      ],
    });
    const analysis = analyzeGptSolutionRoundtrip(entry, response, ["1", "3"]);
    const result = applyGptSolutionRoundtrip(entry, analysis, [{
      questionNumber: "1",
      approved: true,
      fields: { answer: "existing", explanation: "incoming", steps: "fill" },
    }], () => "new-id");

    expect(result.appliedQuestionNumbers).toEqual(["1"]);
    expect(result.entry.answerKey?.[0]).toMatchObject({
      id: "answer-1",
      questionNumber: "01",
      answer: "①",
      explanation: "새 해설",
      steps: ["조건 확인"],
      legacyMarker: "preserve me",
    });
    expect(result.entry.answerKey).toHaveLength(1);
    expect(result.entry.learningBlocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "new-id", sourceQuestionNumber: "1", title: "핵심 개념" }),
    ]));
  });

  it("deduplicates learning blocks and lets an approved lecture-only solution avoid a blank answer item", () => {
    const response = validatedResponse({
      entryId: entry.id,
      questionNumbers: ["1", "3"],
      solutions: [
        { questionNumber: "1", learningBlocks: [{ type: "concept", title: "기존 개념", content: "새 내용" }] },
        { questionNumber: "3", learningBlocks: [{ type: "routine", title: "풀이 루틴", content: "순서대로 푼다." }] },
      ],
    });
    const analysis = analyzeGptSolutionRoundtrip(entry, response, ["1", "3"]);
    const result = applyGptSolutionRoundtrip(entry, analysis, [
      { questionNumber: "1", approved: true },
      { questionNumber: "3", approved: true },
    ], () => "lecture-id");

    expect(result.entry.answerKey).toHaveLength(1);
    expect(result.entry.learningBlocks).toHaveLength(2);
    expect(result.entry.learningBlocks?.at(-1)).toMatchObject({
      id: "lecture-id",
      sourceQuestionNumber: "3",
      title: "풀이 루틴",
    });
  });
});
