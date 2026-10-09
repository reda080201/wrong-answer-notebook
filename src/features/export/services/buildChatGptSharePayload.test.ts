import { describe, expect, it } from "vitest";
import { buildChatGptSharePayload } from "./buildChatGptSharePayload";
import type { ExamSession } from "../../../types";

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
  it("shares a single legacy wrong answer only within the selected consent scope", () => {
    const source = { ...(entry as object), entryKind: "wrong_answer", question: "[문제 31] 단일 오답\n① 하나\n② 둘", questionContentSegments: undefined, answerKey: [], myAnswer: "내 응답", correctAnswer: "기존 정답", explanationParts: [{ text: "기존 해설" }] } as never;
    const options = { entry: source, questionNumbers: ["31"], scope: "current" as const };
    const allowed = buildChatGptSharePayload({ ...options, preferences: { ...baseOptions, shareUserResponse: true, shareExistingAnswersAndExplanations: true } });
    expect(allowed.questions[0]).toMatchObject({ answer: "기존 정답", explanation: "기존 해설", userResponse: "내 응답" });
    const blocked = buildChatGptSharePayload({ ...options, preferences: baseOptions });
    expect(blocked.questions[0].answer).toBeUndefined();
    expect(blocked.questions[0].explanation).toBeUndefined();
    expect(blocked.questions[0].userResponse).toBeUndefined();
    const multiple = { ...(source as object), question: "[문제 31] 첫 오답\n① 하나\n② 둘\n[문제 32] 둘째 오답\n① 셋\n② 넷" } as never;
    expect(buildChatGptSharePayload({ ...options, entry: multiple, preferences: { ...baseOptions, shareExistingAnswersAndExplanations: true } }).questions[0].answer).toBeUndefined();
  });
  it("uses submitted snapshot answers rather than subsequently edited source answers", () => {
    const examSession = { status: "submitted", questions: [{ id: "q3", questionNumber: "3", question: "제출 당시 본문", choices: [], correctAnswer: "저장된 정답", explanation: "저장된 해설" }], responses: [] } as unknown as ExamSession;
    const payload = buildChatGptSharePayload({ entry, questionNumbers: ["3"], scope: "current", examSession, preferences: { ...baseOptions, shareExistingAnswersAndExplanations: true } });
    expect(payload.questions[0]).toMatchObject({ questionText: "제출 당시 본문", answer: "저장된 정답", explanation: "저장된 해설" });
  });
  it("does not guess between duplicate official answer numbers", () => {
    const source = { ...(entry as object), answerKey: [{ questionNumber: "3", answer: "A" }, { questionNumber: "03번", answer: "B" }] } as never;
    const payload = buildChatGptSharePayload({ entry: source, questionNumbers: ["3"], scope: "current", preferences: { ...baseOptions, shareExistingAnswersAndExplanations: true } });
    expect(payload.questions[0].answer).toBeUndefined();
  });
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

  it("includes a common passage from the entry when no exam session is supplied", () => {
    const passageEntry = {
      ...(entry as object),
      question: "[지문]\n공통으로 읽을 자료\n\n[문제 3] 세 번째 문제\n① 하나\n② 둘",
    } as never;
    const payload = buildChatGptSharePayload({
      entry: passageEntry,
      questionNumbers: ["3"],
      scope: "selected",
      preferences: baseOptions,
    });

    expect(payload.questions[0].passage).toContain("공통으로 읽을 자료");
  });

  it("does not include a common passage when question text sharing is disabled", () => {
    const passageEntry = {
      ...(entry as object),
      question: "[지문]\n공통으로 읽을 자료\n\n[문제 3] 세 번째 문제\n① 하나\n② 둘",
    } as never;
    const payload = buildChatGptSharePayload({
      entry: passageEntry,
      questionNumbers: ["3"],
      scope: "selected",
      preferences: { ...baseOptions, shareQuestionText: false },
    });

    expect(payload.questions[0].passage).toBeUndefined();
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
