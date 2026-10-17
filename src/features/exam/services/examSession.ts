import { confirmedQuestionHotspots, solutionFigures } from "../../solutions/solutionModel";
import { v4 as uuidv4 } from "uuid";
import type { ExamMode, ExamQuestionSnapshot, ExamResponse, ExamSession, QuestionContentSegment, WrongAnswerEntry } from "../../../types";
import { parseQuestionText, type QuestionBlock } from "../../../utils/textLayout";
import { getEntryQuestions } from "../../../utils/entryQuestions";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";
import { resolveQuestionAssets, resolveQuestionFigures } from "../../../utils/questionAssets";
import { figureTokenWarning, readFigureTokenReferences, unresolvedFigureTokens } from "../../../utils/figureTokens";
import { resolveFigureRepresentation } from "../../figures/services/figureRepresentation";

export interface ExamSessionCreationOptions {
  mode?: ExamMode;
  timeLimitMinutes?: number;
  showTimer?: boolean;
  answerSheetOpen?: boolean;
  answerSheetLayout?: "auto" | "vertical" | "horizontal";
}

export { resolveEntryQuestionStimuli } from "../../../utils/questionStimuli";
export type { EntryQuestionStimulus } from "../../../utils/questionStimuli";
import { resolveEntryQuestionStimuli } from "../../../utils/questionStimuli";

/** Shared immutable content projection for ordinary and generated exams. */
export function createExamQuestionSnapshots(entry: WrongAnswerEntry): ExamQuestionSnapshot[] {
  const blocks = parseQuestionText(entry.question);
  const questions = getEntryQuestions(entry);
  const legacyQuestions = blocks.filter((item): item is QuestionBlock => item.kind === "question");
  const stimulusByQuestion = resolveEntryQuestionStimuli(entry);
  const snapshots: ExamQuestionSnapshot[] = questions.map((block, index) => {
    const number = block.questionNumber || String(index + 1);
    const normalizedNumber = normalizeQuestionNumber(number);
    const answer = entry.answerKey?.find((item) => normalizeQuestionNumber(item.questionNumber) === normalizedNumber);
    const legacyBlock = legacyQuestions.find((item) => normalizeQuestionNumber(item.displayNumber) === normalizedNumber);
    const stimulus = block.passage ?? stimulusByQuestion.get(normalizedNumber);
    const tokenReferences = readFigureTokenReferences([
      stimulus?.text,
      block.questionText,
      ...block.choices,
      ...(block.contentSegments ?? []).flatMap((segment) => segment.type === "text" || segment.type === "condition" ? [segment.text] : segment.type === "figure" ? [`[FIGURE:${segment.figureId}]`] : []),
    ]);
    const figureIds = [...new Set([...block.figureIds, ...tokenReferences.map(({ id }) => id).filter(Boolean)])];
    const referencedBlock = { ...block, figureIds };
    const figures = resolveQuestionFigures(entry, referencedBlock).map((figure) => {
      const representation = resolveFigureRepresentation(figure);
      return { ...figure, image: representation.image, source: representation.kind === "cleaned" ? "gpt_cleaned" as const : representation.kind === "original" ? "original" as const : "described_only" as const, needsReview: representation.needsReview };
    });
    const tokenWarning = figureTokenWarning(unresolvedFigureTokens(tokenReferences.map(({ raw }) => raw), entry.figures ?? []));
    const warning = [block.warning, tokenWarning].filter((value, warningIndex, values) => value && values.indexOf(value) === warningIndex).join(" ") || undefined;
    const assets = resolveQuestionAssets(entry, referencedBlock);
    return {
      id: `${entry.id}-${number}`,
      questionNumber: number,
      passage: stimulus?.text,
      stimulusGroupId: stimulus?.id,
      section: block.section,
      questionType: block.questionType,
      question: block.questionText,
      conditions: structuredClone(block.conditions),
      equations: structuredClone(block.equations),
      choices: structuredClone(block.choices),
      questionImages: structuredClone([...assets.sourceCrops.map((crop) => crop.image), ...assets.figureAssets]),
      sourcePageImages: structuredClone([...new Set([...assets.sourcePages, ...confirmedQuestionHotspots(entry, block).map(hotspot => hotspot.sourcePageImage)])]),
      questionSolutionHotspots: confirmedQuestionHotspots(entry, block).map(hotspot => ({ ...hotspot, questionKey: `${entry.id}-${number}` })),
      solutionAnswer: answer ? structuredClone(answer) : undefined,
      solutionFigures: solutionFigures(answer, entry.figures ?? []),
      figures: structuredClone(figures),
      contentSegments: block.contentSegments
        ? structuredClone(block.contentSegments)
        : (legacyBlock ? resolveContentSegments(entry, normalizedNumber, legacyBlock, figures) : undefined),
      needsReview: Boolean(block.needsReview || tokenWarning),
      correctAnswer: answer?.answer,
      explanation: answer?.explanation,
      points: block.points,
      warning,
      sourceWarning: warning,
      figureIds: structuredClone(figureIds),
      source: block.source ? structuredClone(block.source) : undefined,
    };
  });
  return snapshots;
}

export function createExamSession(entry: WrongAnswerEntry, now = new Date(), options: ExamSessionCreationOptions = {}): ExamSession {
  const snapshots = createExamQuestionSnapshots(entry);
  const questions = getEntryQuestions(entry);
  const mode = options.mode === "real" ? "real" : "practice";
  const sourcePageQuestionMap = buildExplicitSourcePageQuestionMap(entry, questions);
  const startedAt = now.toISOString();
  const timeLimitMinutes = mode === "real" && Number.isFinite(options.timeLimitMinutes) && (options.timeLimitMinutes ?? 0) > 0
    ? options.timeLimitMinutes
    : undefined;
  return {
    id: uuidv4(),
    entryId: entry.id,
    title: entry.title,
    subject: entry.subject,
    status: "in_progress",
    mode,
    timeLimitMinutes,
    deadlineAt: timeLimitMinutes ? new Date(now.getTime() + timeLimitMinutes * 60_000).toISOString() : undefined,
    showTimer: mode === "real" ? options.showTimer !== false : undefined,
    answerSheetOpen: mode === "real" ? options.answerSheetOpen !== false : undefined,
    answerSheetLayout: mode === "real" ? options.answerSheetLayout ?? "auto" : undefined,
    questions: snapshots,
    sourcePageImages: structuredClone(entry.sourcePageImages ?? []),
    sourcePageQuestionMap,
    ...(mode === "real"
      ? { selectedSourcePageImages: Object.entries(sourcePageQuestionMap).filter(([, numbers]) => numbers.length > 0).map(([filename]) => filename) }
      : {}),
    responses: [],
    currentQuestionIndex: 0,
    startedAt,
    updatedAt: startedAt,
  };
}

function buildExplicitSourcePageQuestionMap(
  entry: WrongAnswerEntry,
  questions: ReturnType<typeof getEntryQuestions>,
): Record<string, string[]> {
  const pageNames = new Set(entry.sourcePageImages ?? []);
  const byPage = new Map<string, string[]>();
  const add = (filename: string | undefined, questionNumber: string) => {
    if (!filename || !pageNames.has(filename)) return;
    const numbers = byPage.get(filename) ?? [];
    if (!numbers.includes(questionNumber)) numbers.push(questionNumber);
    byPage.set(filename, numbers);
  };
  for (const question of questions) {
    const number = normalizeQuestionNumber(question.questionNumber);
    for (const page of resolveQuestionAssets(entry, question, { allowLegacySingleQuestionFallback: false }).sourcePages) add(page, number);
    for (const hotspot of confirmedQuestionHotspots(entry, question)) add(hotspot.sourcePageImage, number);
    if (question.source?.page) add(entry.sourcePageImages?.[question.source.page - 1], number);
    for (const crop of entry.questionSourceCrops ?? []) {
      if (normalizeQuestionNumber(crop.questionNumber) !== number) continue;
      add(crop.sourcePageImage ?? (crop.page ? entry.sourcePageImages?.[crop.page - 1] : undefined), number);
    }
    for (const figure of resolveQuestionFigures(entry, question)) {
      add(figure.original?.sourcePageImage, number);
    }
  }
  return Object.fromEntries(byPage);
}

export function updateExamResponse(session: ExamSession, response: ExamResponse, now = new Date()): ExamSession {
  const responses = session.responses.filter((item) => item.questionNumber !== response.questionNumber);
  return { ...session, responses: [...responses, response], updatedAt: now.toISOString() };
}

export function publicExamQuestion(session: ExamSession, index = session.currentQuestionIndex) {
  const question = session.questions[index];
  if (!question) return null;
  const response = session.responses.find((item) => item.questionNumber === question.questionNumber);
  return {
    sessionId: session.id,
    title: session.title,
    subject: session.subject,
    status: session.status,
    questionIndex: index,
    totalQuestions: session.questions.length,
    question: { ...question, correctAnswer: undefined, explanation: undefined, solutionAnswer: undefined, solutionFigures: undefined, questionSolutionHotspots: undefined },
    response: response?.response ?? "",
    scratchNote: response?.scratchNote ?? "",
    markedForReview: response?.markedForReview ?? false,
    submitted: session.status === "submitted",
    answerAvailable: false,
  };
}

function resolveContentSegments(
  entry: WrongAnswerEntry,
  questionNumber: string,
  block: QuestionBlock,
  figures: ExamQuestionSnapshot["figures"],
): QuestionContentSegment[] | undefined {
  const stored = entry.questionContentSegments?.[questionNumber];
  if (stored?.length) return stored;
  const segments: QuestionContentSegment[] = [];
  for (const [index, body] of block.bodySegments.entries()) {
    const id = `body-${index + 1}`;
    const figureToken = body.text.match(/^\s*\[FIGURE:([^\]]+)\]\s*$/i);
    if (figureToken?.[1]) {
      segments.push({ id, type: "figure", figureId: figureToken[1].trim() });
    } else {
      segments.push(body.kind === "condition"
        ? { id, type: "condition", label: body.label, text: body.text }
        : { id, type: "text", text: body.text });
    }
  }
  const placed = figures
    .filter((figure) => figure.placement?.afterSegmentId)
    .sort((a, b) => (a.placement?.order ?? 0) - (b.placement?.order ?? 0));
  for (const figure of placed) {
    const after = figure.placement?.afterSegmentId;
    const index = segments.findIndex((segment) => segment.id === after);
    if (index >= 0 && !segments.some((segment) => segment.type === "figure" && segment.figureId === figure.id)) {
      segments.splice(index + 1, 0, { id: `figure-${figure.id}`, type: "figure", figureId: figure.id });
    }
  }
  return segments.length ? segments : undefined;
}
