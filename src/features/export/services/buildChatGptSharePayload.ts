import type { ExamSession, ExportScopeMode, McpSendOptions, WrongAnswerEntry } from "../../../types";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";
import { getEntryQuestions } from "../../../utils/entryQuestions";
import { resolveEntryQuestionStimuli } from "../../exam/services/examSession";
import { resolveQuestionAssets, resolveQuestionFigures } from "../../../utils/questionAssets";
import type { ChatGptSharePayload } from "../types";

export function filterChatGptSharePayload(payload: ChatGptSharePayload, preferences: McpSendOptions): ChatGptSharePayload {
  return {
    ...payload,
    answerProtection: preferences.shareExistingAnswersAndExplanations ? "released" : "active",
    questions: payload.questions.map(question => ({
      questionNumber: question.questionNumber,
      questionText: preferences.shareQuestionText ? question.questionText : undefined,
      passage: preferences.shareQuestionText ? question.passage : undefined,
      contentSegments: preferences.shareQuestionText ? question.contentSegments : undefined,
      choices: preferences.shareChoices ? question.choices : [],
      images: preferences.shareQuestionImages || preferences.shareSourcePageImages ? question.images : [],
      userResponse: preferences.shareUserResponse ? question.userResponse : undefined,
      scratchNote: preferences.shareScratchNote ? question.scratchNote : undefined,
      answer: preferences.shareExistingAnswersAndExplanations ? question.answer : undefined,
      explanation: preferences.shareExistingAnswersAndExplanations ? question.explanation : undefined,
    })),
  };
}

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
  const stimuli = resolveEntryQuestionStimuli(options.entry);
  const questions = options.questionNumbers.map((questionNumber) => {
    const normalized = normalizeQuestionNumber(questionNumber);
    const matchingBlocks = blocks.filter(item => normalizeQuestionNumber(item.questionNumber) === normalized);
    const block = matchingBlocks.length === 1 ? matchingBlocks[0] : undefined;
    const matchingSnapshots = options.examSession?.questions.filter(item => normalizeQuestionNumber(item.questionNumber) === normalized) ?? [];
    const sessionQuestion = matchingSnapshots.length === 1 ? matchingSnapshots[0] : undefined;
    const response = options.examSession?.responses.find((item) => normalizeQuestionNumber(item.questionNumber) === normalized);
    const answers = options.entry.answerKey?.filter(item => normalizeQuestionNumber(item.questionNumber) === normalized) ?? [];
    const answer = matchingBlocks.length === 1 && answers.length === 1 ? answers[0] : undefined;
    const singleWrongAnswer = blocks.length === 1 && matchingBlocks.length === 1 && answers.length === 0
      && (options.entry.entryKind === "wrong_answer" || options.entry.entryKind === undefined);
    const assets = block ? resolveQuestionAssets(options.entry, block) : undefined;
    const images: string[] = [];
    if (options.preferences.shareQuestionImages) {
      for (const figure of (block ? resolveQuestionFigures(options.entry, block) : [])) {
        if (figure.image) images.push(figure.image);
      }
      for (const image of assets?.sourceCrops.map((crop) => crop.image) ?? sessionQuestion?.questionImages ?? []) images.push(image);
    }
    if (options.preferences.shareSourcePageImages) {
      for (const image of assets?.sourcePages ?? sessionQuestion?.sourcePageImages ?? []) images.push(image);
    }
    return {
      questionNumber,
      questionText: options.preferences.shareQuestionText ? sessionQuestion?.question ?? block?.questionText : undefined,
      passage: options.preferences.shareQuestionText
        ? sessionQuestion?.passage ?? stimuli.get(questionNumber)?.text
        : undefined,
      contentSegments: options.preferences.shareQuestionText ? sessionQuestion?.contentSegments ?? block?.contentSegments : undefined,
      choices: options.preferences.shareChoices
        ? sessionQuestion?.choices ?? (block?.choices ?? []).map((choice) => choice.replace(/^\s*(?:①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩|\(\d{1,2}\)|\d{1,2}\)|[A-Ea-e][.)])\s*/, ""))
        : [],
      images: [...new Set(images)],
      userResponse: options.preferences.shareUserResponse ? response?.response ?? (singleWrongAnswer ? options.entry.myAnswer : undefined) : undefined,
      scratchNote: options.preferences.shareScratchNote ? response?.scratchNote : undefined,
      answer: allowAnswers ? submitted ? sessionQuestion?.solutionAnswer?.answer ?? sessionQuestion?.correctAnswer : answer?.answer ?? (singleWrongAnswer ? options.entry.correctAnswer : undefined) : undefined,
      explanation: allowAnswers ? submitted ? sessionQuestion?.solutionAnswer?.explanation ?? sessionQuestion?.explanation : answer?.explanation ?? (singleWrongAnswer ? options.entry.explanationParts?.map(part => part.text).filter(Boolean).join("\n") : undefined) : undefined,
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

