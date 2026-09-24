import { describe, expect, it } from "vitest";
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
});
