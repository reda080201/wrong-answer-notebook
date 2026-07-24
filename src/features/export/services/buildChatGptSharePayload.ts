import type { ChatGptMcpPreferences, ExamSession, ExportScopeMode, WrongAnswerEntry } from "../../../types";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";
import { parseQuestionText } from "../../../utils/textLayout";
import type { ChatGptSharePayload } from "../types";
import { canIncludeAnswers } from "./answerProtection";

export function buildChatGptSharePayload(options: {
  entry: WrongAnswerEntry;
  questionNumbers: string[];
  scope: ExportScopeMode;
  examSession?: ExamSession | null;
  preferences: Pick<ChatGptMcpPreferences, "shareUserResponse" | "shareScratchNote" | "shareQuestionImages" | "shareSourcePageImages">;
}): ChatGptSharePayload {
  const submitted = options.examSession?.status === "submitted";
  const allowAnswers = canIncludeAnswers({ submitted, allowAnswers: false });
  const blocks = parseQuestionText(options.entry.question);
  const questions = options.questionNumbers.map((questionNumber) => {
    const block = blocks.find((item): item is Extract<(typeof blocks)[number], { kind: "question" }> => item.kind === "question" && normalizeQuestionNumber(String(item.displayNumber || item.numberLabel || "")) === questionNumber);
    const sessionQuestion = options.examSession?.questions.find((item) => normalizeQuestionNumber(item.questionNumber) === questionNumber);
    const response = options.examSession?.responses.find((item) => normalizeQuestionNumber(item.questionNumber) === questionNumber);
    const images: string[] = [];
    if (options.preferences.shareQuestionImages) {
      for (const figure of options.entry.figures ?? []) {
        if (normalizeQuestionNumber(figure.questionNumber) === questionNumber && figure.image) images.push(figure.image);
      }
      for (const image of sessionQuestion?.questionImages ?? []) images.push(image);
    }
    if (options.preferences.shareSourcePageImages) {
      for (const image of sessionQuestion?.sourcePageImages ?? options.entry.questionImages ?? []) images.push(image);
    }
    return {
      questionNumber,
      passage: sessionQuestion?.passage,
      contentSegments: options.entry.questionContentSegments?.[questionNumber],
      choices: sessionQuestion?.choices ?? block?.choices.map((choice) => choice.text) ?? [],
      images: [...new Set(images)],
      userResponse: options.preferences.shareUserResponse ? response?.response : undefined,
      scratchNote: options.preferences.shareScratchNote ? response?.scratchNote : undefined,
    };
  });
  return {
    title: options.entry.title,
    subject: options.entry.subject,
    scope: options.scope,
    questionNumbers: options.questionNumbers,
    submitted,
    answerProtection: allowAnswers ? "released" : "active",
    questions,
  };
}

