import { describe, expect, it } from "vitest";
import { buildChatGptSharePayload } from "./buildChatGptSharePayload";

const entry = {
  id: "sheet-1",
  title: "선택 문제지",
  subject: "수학",
  entryKind: "problem_sheet",
  question: "[문제 3] 세 번째 문제\n① 하나\n② 둘\n[문제 7] 일곱 번째 문제\n① 셋\n② 넷",
  answerKey: [
    { id: "answer-3", questionNumber: "03번", answer: "②", explanation: "세 번째 해설" },
    { id: "answer-7", questionNumber: "7", answer: "①", explanation: "일곱 번째 해설" },
  ],
  questionContentSegments: { "3": [{ id: "segment-3", type: "text", text: "세 번째 구조" }] },
} as never;

const baseOptions = {
  shareQuestionText: true,
  shareChoices: true,
  shareQuestionImages: false,
  shareSourcePageImages: false,
  shareUserResponse: false,
  shareScratchNote: false,
  shareExistingAnswersAndExplanations: false,
};

describe("buildChatGptSharePayload", () => {
  it("keeps only the selected questions in their sheet order and protects answers by default", () => {
    const payload = buildChatGptSharePayload({
      entry,
      questionNumbers: ["3", "7"],
      scope: "selected",
      preferences: baseOptions,
    });

    expect(payload.questionNumbers).toEqual(["3", "7"]);
    expect(payload.questions.map((question) => question.questionNumber)).toEqual(["3", "7"]);
    expect(payload.questions[0]).toMatchObject({ questionText: "세 번째 문제", choices: ["하나", "둘"] });
    expect(payload.questions[0].answer).toBeUndefined();
    expect(payload.questions[0].explanation).toBeUndefined();
    expect(payload.answerProtection).toBe("active");
  });

  it("includes answers only after the explicit per-send option and removes every text field when disabled", () => {
    const payload = buildChatGptSharePayload({
      entry,
      questionNumbers: ["3"],
      scope: "selected",
      preferences: {
        ...baseOptions,
        shareQuestionText: false,
        shareChoices: false,
        shareExistingAnswersAndExplanations: true,
      },
    });

    expect(payload.questions[0]).toMatchObject({ questionNumber: "3", answer: "②", explanation: "세 번째 해설", choices: [] });
    expect(payload.questions[0].questionText).toBeUndefined();
    expect(payload.questions[0].contentSegments).toBeUndefined();
    expect(payload.answerProtection).toBe("released");
  });
});
