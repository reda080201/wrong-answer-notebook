import type { ExamSession, ExportScopeMode, McpSendOptions, WrongAnswerEntry } from "../../../types";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";
import { getEntryQuestions } from "../../../utils/entryQuestions";
import { resolveQuestionAssets } from "../../../utils/questionAssets";
import type { ChatGptSharePayload } from "../types";

export function buildChatGptSharePayload(options: {
  entry: WrongAnswerEntry;
  questionNumbers: string[];
  scope: ExportScopeMode;
  examSession?: ExamSession | null;
  preferences: McpSendOptions;
}): ChatGptSharePayload {
  const submitted = options.examSession?.status === "submitted";
  const allowAnswers = options.preferences.shareExistingAnswersAndExplanations;
  const blocks = getEntryQuestions(options.entry);
  const questions = options.questionNumbers.map((questionNumber) => {
    const block = blocks.find((item) => normalizeQuestionNumber(item.questionNumber) === questionNumber);
    const sessionQuestion = options.examSession?.questions.find((item) => normalizeQuestionNumber(item.questionNumber) === questionNumber);
    const response = options.examSession?.responses.find((item) => normalizeQuestionNumber(item.questionNumber) === questionNumber);
    const answer = options.entry.answerKey?.find((item) => normalizeQuestionNumber(item.questionNumber) === questionNumber);
    const assets = block ? resolveQuestionAssets(options.entry, block) : undefined;
    const images: string[] = [];
    if (options.preferences.shareQuestionImages) {
      for (const figure of options.entry.figures ?? []) {
        if (normalizeQuestionNumber(figure.questionNumber) === questionNumber && figure.image) images.push(figure.image);
      }
      for (const image of assets?.sourceCrops.map((crop) => crop.image) ?? sessionQuestion?.questionImages ?? []) images.push(image);
    }
    if (options.preferences.shareSourcePageImages) {
      for (const image of assets?.sourcePages ?? sessionQuestion?.sourcePageImages ?? []) images.push(image);
    }
    return {
      questionNumber,
      questionText: options.preferences.shareQuestionText ? block?.questionText : undefined,
      passage: options.preferences.shareQuestionText ? sessionQuestion?.passage : undefined,
      contentSegments: options.preferences.shareQuestionText ? block?.contentSegments : undefined,
      choices: options.preferences.shareChoices
        ? sessionQuestion?.choices ?? (block?.choices ?? []).map((choice) => choice.replace(/^\s*(?:①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩|\(\d{1,2}\)|\d{1,2}\)|[A-Ea-e][.)])\s*/, ""))
        : [],
      images: [...new Set(images)],
      userResponse: options.preferences.shareUserResponse ? response?.response : undefined,
      scratchNote: options.preferences.shareScratchNote ? response?.scratchNote : undefined,
      answer: allowAnswers ? answer?.answer : undefined,
      explanation: allowAnswers ? answer?.explanation : undefined,
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

