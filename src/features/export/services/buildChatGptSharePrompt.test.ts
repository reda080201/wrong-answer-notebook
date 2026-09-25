import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../../../types";
import { buildChatGptSharePayload } from "./buildChatGptSharePayload";
import type { ChatGptSharePayload } from "../types";
import { buildChatGptSharePrompt } from "./buildChatGptSharePrompt";

const base: ChatGptSharePayload = {
  title: "시험", subject: "수학", scope: "whole", questionNumbers: ["1"], submitted: true, answerProtection: "active",
  questions: [{ questionNumber: "1", questionText: "QUESTION SECRET", passage: "PASSAGE SECRET", contentSegments: [], choices: ["CHOICE SECRET"], images: [], userResponse: "RESPONSE SECRET", scratchNote: "NOTE SECRET" }],
};

describe("buildChatGptSharePrompt", () => {
  it("includes only projected fields and does not imply hidden official answers", () => {
    const prompt = buildChatGptSharePrompt(base, "문제를 분석해 줘");
    expect(prompt).toContain("QUESTION SECRET");
    expect(prompt).toContain("CHOICE SECRET");
    expect(prompt).toContain("RESPONSE SECRET");
    expect(prompt).toContain("NOTE SECRET");
    expect(prompt).not.toContain("정답:");
    expect(prompt).not.toContain("해설:");
    expect(prompt).toContain("가정하거나 비교하지 마세요");
  });

  it("prints answers only when present in an explicitly released payload", () => {
    const payload: ChatGptSharePayload = { ...base, answerProtection: "released", questions: [{ ...base.questions[0], answer: "ANSWER SECRET", explanation: "EXPLANATION SECRET" }] };
    const prompt = buildChatGptSharePrompt(payload, "공식 해설과 비교해 줘");
    expect(prompt).toContain("ANSWER SECRET");
    expect(prompt).toContain("EXPLANATION SECRET");
  });

  it("does not leak disabled fields even when they exist in the source object", () => {
    const payload: ChatGptSharePayload = { ...base, questions: [{ ...base.questions[0], questionText: undefined, choices: [], userResponse: undefined, scratchNote: undefined }] };
    const prompt = buildChatGptSharePrompt(payload, "힌트를 줘");
    for (const secret of ["QUESTION SECRET", "CHOICE SECRET", "RESPONSE SECRET", "NOTE SECRET"]) expect(prompt).not.toContain(secret);
  });

  it("does not repeat a stem already present in the normalized presentation stream", () => {
    const entry = {
      id: "canonical-entry",
      title: "시험",
      subject: "수학",
      question: "",
      structuredQuestions: [{
        questionNumber: "1",
        questionText: "함수 f에 대하여 값을 구하여라.",
        conditions: ["(가) f(0)=1"],
        equations: [],
        choices: [],
        contentSegments: [
          { id: "stem", type: "text", text: "함수 f에 대하여 값을 구하여라." },
          { id: "condition", type: "condition", label: "(가)", text: "f(0)=1" },
        ],
        figureIds: [],
      }],
    } as unknown as WrongAnswerEntry;
    const payload = buildChatGptSharePayload({
      entry,
      questionNumbers: ["1"],
      scope: "current",
      preferences: {
        shareQuestionText: true,
        shareChoices: true,
        shareQuestionImages: false,
        shareSourcePageImages: false,
        shareUserResponse: false,
        shareScratchNote: false,
        shareExistingAnswersAndExplanations: false,
      },
    });
    const prompt = buildChatGptSharePrompt(payload, "힌트만 줘");

    expect(prompt.split("함수 f에 대하여 값을 구하여라.")).toHaveLength(2);
    expect(prompt.split("f(0)=1")).toHaveLength(2);
  });

  it("preserves a legacy-only stem when the presentation stream is absent", () => {
    const payload: ChatGptSharePayload = {
      ...base,
      questions: [{
        questionNumber: "1",
        questionText: "legacy-only stem",
        contentSegments: [],
        choices: [],
        images: [],
      }],
    };
    const prompt = buildChatGptSharePrompt(payload, "힌트를 줘");

    expect(prompt).toContain("legacy-only stem");
  });

  it("preserves intentional duplicate equations in presentation stream order", () => {
    const payload: ChatGptSharePayload = {
      ...base,
      questions: [{
        questionNumber: "1",
        contentSegments: [
          { id: "equation-a", type: "equation", latex: "x+y=1", display: true },
          { id: "equation-b", type: "equation", latex: "x+y=1", display: true },
        ],
        choices: [],
        images: [],
      }],
    };
    const prompt = buildChatGptSharePrompt(payload, "힌트를 줘");

    expect(prompt.match(/x\+y=1/g)).toHaveLength(2);
  });
});
