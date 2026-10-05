import { validSolutionHotspot } from "./hotspotValidation";
export { validSolutionHotspot } from "./hotspotValidation";
import type { ExamQuestionSnapshot, QuestionSolutionHotspot, SheetAnswerItem, SheetFigureItem, WrongAnswerEntry } from "../../types";
import { getEntryQuestions, type ResolvedEntryQuestion } from "../../utils/entryQuestions";
import { readFigureTokenReferences } from "../../utils/figureTokens";
import { normalizeQuestionNumber } from "../../utils/questionNumber";

export interface SolutionQuestion {
  key: string;
  number: string;
  section?: string;
  page?: number;
  answer?: SheetAnswerItem;
  figures: SheetFigureItem[];
}

export function solutionQuestionKey(question: Pick<ResolvedEntryQuestion, "questionNumber" | "section">): string {
  return JSON.stringify([normalizeQuestionNumber(question.questionNumber), question.section ?? ""]);
}

export function entrySolutionQuestions(entry: Pick<WrongAnswerEntry, "question" | "structuredQuestions" | "questionContentSegments" | "answerKey" | "figures">): SolutionQuestion[] {
  const questions = getEntryQuestions(entry);
  return questions.map(question => {
    const number = normalizeQuestionNumber(question.questionNumber);
    const answers = (entry.answerKey ?? []).filter(answer => normalizeQuestionNumber(answer.questionNumber) === number);
    const uniqueNumber = questions.filter(item => normalizeQuestionNumber(item.questionNumber) === number).length === 1;
    return { key: solutionQuestionKey(question), number: question.questionNumber, section: question.section, page: question.source?.page,
      answer: uniqueNumber && answers.length === 1 ? answers[0] : undefined, figures: entry.figures ?? [] };
  });
}

export function confirmedQuestionHotspots(entry: WrongAnswerEntry, question: ResolvedEntryQuestion): QuestionSolutionHotspot[] {
  const key = solutionQuestionKey(question);
  if (getEntryQuestions(entry).filter(item => solutionQuestionKey(item) === key).length !== 1) return [];
  return (entry.questionSolutionHotspots ?? []).filter(hotspot => hotspot.questionKey === key && validSolutionHotspot(hotspot));
}

export function snapshotSolutionQuestions(questions: ExamQuestionSnapshot[]): SolutionQuestion[] {
  return questions.map(question => ({ key: question.id, number: question.questionNumber, figures: [...question.figures, ...(question.solutionFigures ?? [])],
    answer: question.solutionAnswer ?? (question.correctAnswer || question.explanation ? {
      id: question.id, questionNumber: question.questionNumber, answer: question.correctAnswer ?? "", explanation: question.explanation ?? "", importantPoints: [],
    } : undefined) }));
}


/** Raster dots contain no question identity. Detection only proposes positions. */
export function detectBlueDotPositions(image: HTMLImageElement): Array<{ x: number; y: number }> {
  const width = Math.min(image.naturalWidth, 1400);
  const height = Math.round(image.naturalHeight * width / image.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("페이지의 점 위치를 분석할 수 없습니다.");
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    const r = pixels[i * 4], g = pixels[i * 4 + 1], b = pixels[i * 4 + 2];
    if (pixels[i * 4 + 3] > 180 && b > 120 && b - g > 45 && b - r > 35) mask[i] = 1;
  }
  const positions: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const stack = [i]; mask[i] = 0;
    let count = 0, minX = width, maxX = 0, minY = height, maxY = 0;
    while (stack.length) {
      const index = stack.pop()!; const x = index % width, y = Math.floor(index / width);
      count++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const neighbor of [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]) {
        if (neighbor >= 0 && mask[neighbor]) { mask[neighbor] = 0; stack.push(neighbor); }
      }
    }
    const w = maxX - minX + 1, h = maxY - minY + 1;
    if (count >= 3 && w <= width * 0.03 && h <= width * 0.03 && w / h >= 0.45 && w / h <= 2.2 && count / (w * h) >= 0.35) {
      positions.push({ x: (minX + maxX + 1) / (2 * width), y: (minY + maxY + 1) / (2 * height) });
    }
  }
  return positions.sort((a, b) => Math.floor(a.x * 2) - Math.floor(b.x * 2) || a.y - b.y);
}

export function solutionFigures(answer: SheetAnswerItem | undefined, figures: SheetFigureItem[]): SheetFigureItem[] {
  if (!answer) return [];
  const ids = new Set(readFigureTokenReferences([answer.intent, answer.strategy, answer.explanation, ...(answer.steps ?? []), ...(answer.choiceJudgements ?? []).map(item => item.text), answer.wrongPoint, answer.reviewPoint, ...(answer.importantPoints ?? [])]).map(item => item.id));
  return structuredClone(figures.filter(figure => ids.has(figure.id)));
}

/** Number edits must not silently redirect a previously confirmed dot. */
export function reconcileSolutionHotspots(previous: WrongAnswerEntry, next: WrongAnswerEntry): WrongAnswerEntry {
  if (!previous.questionSolutionHotspots?.length) return next;
  const before = getEntryQuestions(previous), after = getEntryQuestions(next);
  const unchangedOrder = JSON.stringify(before.map(solutionQuestionKey)) === JSON.stringify(after.map(solutionQuestionKey));
  return { ...next, questionSolutionHotspots: (next.questionSolutionHotspots ?? []).filter(hotspot => {
    const oldMatches = before.filter(question => solutionQuestionKey(question) === hotspot.questionKey);
    const newMatches = after.filter(question => solutionQuestionKey(question) === hotspot.questionKey);
    return oldMatches.length === 1 && newMatches.length === 1 &&
      (unchangedOrder || oldMatches[0].questionText === newMatches[0].questionText);
  }) };
}
