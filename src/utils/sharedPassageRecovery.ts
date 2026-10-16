import type { ExamQuestionSnapshot, ExamSession, SheetFigureItem, WrongAnswerEntry } from "../types";
import { getEntryQuestions } from "./entryQuestions";
import { normalizeQuestionNumber } from "./questionNumber";
import { readFigureTokenReferences } from "./figureTokens";
import { resolveFigureRepresentation } from "../features/figures/services/figureRepresentation";

const REVIEW_NOTICE = "기존 시험의 공통 지문 연결을 확인하지 못했습니다. 원본 문제지에서 지문을 확인해 주세요.";
type Recovery = { status: "matched"; text: string; id: string; figures: SheetFigureItem[] } | { status: "unavailable" } | { status: "ambiguous" };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Recover only a missing presentation from an unchanged, uniquely identified source. Never write it back. */
function recover(question: ExamQuestionSnapshot, session: ExamSession, entries: WrongAnswerEntry[]): Recovery {
  const sourceId = question.sourceEntryId ?? (!session.entryId.startsWith("generated:") ? session.entryId : undefined);
  const number = normalizeQuestionNumber(question.sourceQuestionNumber ?? question.questionNumber);
  const sources = entries.filter(entry => entry.id === sourceId);
  if (sources.length !== 1) return { status: "ambiguous" };
  const source = sources[0];
  const questions = getEntryQuestions(source);
  const matches = questions.filter(item => normalizeQuestionNumber(item.questionNumber) === number);
  if (matches.length !== 1) return { status: "ambiguous" };
  const match = matches[0];
  if (!match.passage) return { status: match.warning?.includes("공통 지문") ? "ambiguous" : "unavailable" };
  const sourceTime = Date.parse(source.updatedAt), sessionTime = Date.parse(session.startedAt);
  if (!Number.isFinite(sourceTime) || !Number.isFinite(sessionTime) || sourceTime > sessionTime
    || match.questionText.trim() !== question.question.trim() || !same(match.choices, question.choices)
    || !same(match.conditions, question.conditions ?? []) || !same(match.equations, question.equations ?? [])
    || (question.contentSegments?.length && !same(match.contentSegments, question.contentSegments))) return { status: "ambiguous" };
  const ids = new Set(readFigureTokenReferences([match.passage.text]).map(item => item.id));
  const figures = (source.figures ?? []).filter(figure => ids.has(figure.id)).map(figure => {
    const representation = resolveFigureRepresentation(figure);
    return { ...figure, image: representation.image,
      source: representation.kind === "cleaned" ? "gpt_cleaned" as const : representation.kind === "original" ? "original" as const : "described_only" as const,
      needsReview: representation.needsReview };
  });
  if (figures.some(figure => question.figures.some(saved => saved.id === figure.id && !same(saved, figure)))) return { status: "ambiguous" };
  return { status: "matched", text: match.passage.text, id: `${source.id}:${match.passage.id}`, figures };
}

export function presentSessionSharedPassages(session: ExamSession, entries: WrongAnswerEntry[]): ExamSession {
  let changed = false;
  const questions = session.questions.map(question => {
    if (question.passage?.trim()) return question;
    if (session.questions.filter(item => normalizeQuestionNumber(item.questionNumber) === normalizeQuestionNumber(question.questionNumber)).length !== 1) return question;
    const result = recover(question, session, entries);
    if (result.status === "unavailable") return question;
    changed = true;
    if (result.status === "ambiguous") return { ...question, warning: [question.warning, REVIEW_NOTICE].filter(Boolean).join(" ") };
    return { ...question, passage: result.text, stimulusGroupId: result.id,
      figures: [...question.figures, ...result.figures.filter(figure => !question.figures.some(saved => saved.id === figure.id))] };
  });
  return changed ? { ...session, questions } : session;
}

export function presentWrongAnswerSharedPassage(entry: WrongAnswerEntry, sessions: ExamSession[], entries: WrongAnswerEntry[]): WrongAnswerEntry {
  if (!entry.generatedFromExamSessionId || !entry.generatedFromQuestionNumber) return entry;
  const matchingSessions = sessions.filter(session => session.id === entry.generatedFromExamSessionId);
  const session = matchingSessions.length === 1 ? matchingSessions[0] : undefined;
  const number = normalizeQuestionNumber(entry.generatedFromQuestionNumber);
  const snapshots = session?.questions.filter(question => normalizeQuestionNumber(question.questionNumber) === number) ?? [];
  const own = getEntryQuestions(entry);
  if (own.length !== 1 || snapshots.length !== 1 || !session) return entry;
  const snapshot = snapshots[0];
  let result: Recovery = snapshot.passage?.trim()
    ? { status: "matched" as const, text: snapshot.passage, id: snapshot.stimulusGroupId ?? snapshot.id, figures: snapshot.figures }
    : recover(snapshot, session, entries);
  if (result.status === "unavailable") return entry;
  const question = own[0];
  const segments = question.contentSegments ?? [{ id: "legacy-body", type: "text" as const, text: question.questionText }];
  const passageText = result.status === "matched" ? result.text : undefined;
  if (passageText && (entry.question.includes(passageText)
    || segments.some(segment => (segment.type === "text" || segment.type === "condition") && segment.text.includes(passageText)))) return entry;
  if (result.status === "matched" && (question.questionText.trim() !== snapshot.question.trim()
    || !same(question.choices, snapshot.choices)
    || result.figures.some(figure => (entry.figures ?? []).some(saved => saved.id === figure.id && !same(saved, figure))))) result = { status: "ambiguous" };
  const warning = result.status === "ambiguous" ? [question.warning, REVIEW_NOTICE].filter(Boolean).join(" ") : question.warning;
  const id = `recovered-passage-${entry.id}`;
  const recoveredSegments = result.status === "matched"
    ? [{ id: segments.some(segment => segment.id === id) ? `${id}-source` : id, type: "text" as const, text: result.text }, ...segments] : segments;
  return { ...entry, structuredQuestions: [{ ...question, contentSegments: recoveredSegments, warning }],
    questionContentSegments: { ...entry.questionContentSegments, [question.questionNumber]: recoveredSegments },
    figures: result.status === "matched" ? [...(entry.figures ?? []), ...result.figures.filter(figure => !(entry.figures ?? []).some(saved => saved.id === figure.id))] : entry.figures };
}
