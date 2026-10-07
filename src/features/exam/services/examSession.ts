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

export interface EntryQuestionStimulus {
  id: string;
  text: string;
}

export function createExamSession(entry: WrongAnswerEntry, now = new Date(), options: ExamSessionCreationOptions = {}): ExamSession {
  const blocks = parseQuestionText(entry.question);
  const questions = getEntryQuestions(entry);
  const legacyQuestions = blocks.filter((item): item is QuestionBlock => item.kind === "question");
  const stimulusByQuestion = resolveEntryQuestionStimuli(entry);
  const snapshots: ExamQuestionSnapshot[] = questions.map((block, index) => {
    const number = block.questionNumber || String(index + 1);
    const normalizedNumber = normalizeQuestionNumber(number);
    const answer = entry.answerKey?.find((item) => normalizeQuestionNumber(item.questionNumber) === normalizedNumber);
    const legacyBlock = legacyQuestions.find((item) => normalizeQuestionNumber(item.displayNumber) === normalizedNumber);
    const stimulus = legacyBlock ? stimulusByQuestion.get(normalizedNumber) : undefined;
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

interface StimulusRange {
  id: string;
  start: number;
  end: number;
  text: string;
}

function findStimuli(text: string, questions: QuestionBlock[]): StimulusRange[] {
  const markers = getExplicitStimulusStarts(text).filter((start) => isNextGroupStimulusMarker(start, text, questions));
  return markers.map((start, index) => {
    const nextMarker = markers[index + 1] ?? text.length;
    const nextQuestion = questions.find((question) => question.start > start && question.start < nextMarker)?.start ?? nextMarker;
    return {
      id: `stimulus-${index + 1}`,
      start,
      end: nextQuestion,
      text: text.slice(start, nextQuestion).trim(),
    };
  }).filter((item) => item.text);
}

/** Read-only grouping projection shared by entry readers and exam snapshots. */
export function resolveEntryQuestionStimuli(entry: Pick<WrongAnswerEntry, "question">): Map<string, EntryQuestionStimulus> {
  const questions = parseQuestionText(entry.question).filter((item): item is QuestionBlock => item.kind === "question");
  const stimuli = findStimuli(entry.question, questions);
  return new Map(questions.flatMap((question) => {
    const number = normalizeQuestionNumber(String(question.numberLabel ?? question.displayNumber));
    const stimulus = stimuli.filter((item) => item.start < question.start).at(-1);
    return number && stimulus ? [[number, { id: stimulus.id, text: stimulus.text }] as const] : [];
  }));
}


function isNextGroupStimulusMarker(start: number, text: string, questions: QuestionBlock[]): boolean {
  const previous = questions.filter((question) => question.start < start).at(-1);
  if (!previous) return true;

  const contentEnd = getQuestionContentEnd(text, previous, questions);
  if (start < contentEnd) return false;
  return start >= previous.end || hasBlankLineBefore(text, start);
}

function hasBlankLineBefore(text: string, start: number): boolean {
  return /(?:\r\n|\n|\r)[ \t]*(?:\r\n|\n|\r)[ \t]*$/.test(text.slice(0, start));
}

function getQuestionContentEnd(text: string, previous: QuestionBlock, questions: QuestionBlock[]): number {
  if (previous.choices.length > 0) {
    const nextQuestion = questions.find((question) => question.start > previous.start);
    const marker = getExplicitStimulusStarts(text).find(
      (candidate) => candidate > previous.bodyStart && candidate < (nextQuestion?.start ?? text.length),
    );
    return marker ?? previous.choices.at(-1)!.end;
  }

  const nextQuestion = questions.find((question) => question.start > previous.start);
  const scanEnd = nextQuestion?.start ?? text.length;
  const lines = /[^\r\n]*(?:\r\n|\n|\r|$)/g;
  lines.lastIndex = previous.bodyStart;

  // Re-scan from the question body so a separated stimulus heading that was
  // included in the parser slice cannot extend the previous question.
  let lastContentEnd = previous.bodyStart;
  let match: RegExpExecArray | null;
  while ((match = lines.exec(text)) !== null) {
    if (!match[0] && match.index === text.length) break;
    if (match.index >= scanEnd) break;

    const line = match[0].replace(/\r\n|\n|\r$/, "");
    const lineEnd = match.index + line.length;
    const trimmed = line.trim();

    if (isExplicitStimulusLine(trimmed)) {
      return lastContentEnd;
    }
    if (trimmed) {
      lastContentEnd = lineEnd;
    }
    if (lines.lastIndex >= scanEnd || lines.lastIndex === text.length) break;
  }

  return lastContentEnd;
}

function getExplicitStimulusStarts(text: string): number[] {
  const starts: number[] = [];
  const lines = /[^\r\n]*(?:\r\n|\n|\r|$)/g;
  let match: RegExpExecArray | null;
  while ((match = lines.exec(text)) !== null) {
    if (!match[0] && match.index === text.length) break;
    const line = match[0].replace(/\r\n|\n|\r$/, "").trim();
    if (isExplicitStimulusLine(line)) starts.push(match.index);
    if (lines.lastIndex === text.length) break;
  }
  return starts;
}

function isExplicitStimulusLine(line: string): boolean {
  const bracketedPassage = /^(?:\[\s*(?:자료|제시문|지문|도표|그래프|그림)(?:\s*[A-Za-z가-힣0-9]+)?\s*\]|<\s*(?:자료|제시문|지문|도표|그래프|그림)(?:\s*[A-Za-z가-힣0-9]+)?\s*>)$/;
  if (bracketedPassage.test(line)) return true;
  const bracketedTable = /^(?:\[\s*표(?:\s*[A-Za-z가-힣0-9]+)?\s*\]|<\s*표(?:\s*[A-Za-z가-힣0-9]+)?\s*>)$/;
  if (bracketedTable.test(line)) return true;
  if (/^표\s*(?::|：)\s*$/.test(line)) return true;
  return /^표\s+\d+\b/.test(line);
}
