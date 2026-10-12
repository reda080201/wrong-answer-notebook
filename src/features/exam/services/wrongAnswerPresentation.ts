import type { EntryFormData, ExamQuestionSnapshot, ExamSession, QuestionContentSegment } from "../../../types";
import { normalizeQuestionNumber } from "../../../utils/questionNumber";
import { solutionQuestionKey, validSolutionHotspot } from "../../solutions/solutionModel";

/** Copy only this snapshot's confirmed links; source.page indexes the new local page list. */
export function wrongAnswerPresentation(session: ExamSession, question: ExamQuestionSnapshot): Pick<EntryFormData,
  "sourcePageImages" | "structuredQuestions" | "questionContentSegments" | "questionSolutionHotspots" | "answerKey" | "figures" | "supplementalResources"> {
  const number = question.questionNumber;
  const uniqueQuestion = session.questions.filter(item => normalizeQuestionNumber(item.questionNumber) === normalizeQuestionNumber(number)).length === 1;
  const hotspots = uniqueQuestion ? (question.questionSolutionHotspots ?? []).filter(hotspot =>
    hotspot.questionKey === question.id && validSolutionHotspot(hotspot)) : [];
  const mappedPages = uniqueQuestion ? Object.entries(session.sourcePageQuestionMap ?? {})
    .filter(([, numbers]) => numbers.includes(number)).map(([filename]) => filename) : [];
  const pages = [...new Set([
    ...(question.sourcePageImages ?? []), ...(question.linkedSourcePageImages ?? []), ...mappedPages,
    ...hotspots.map(hotspot => hotspot.sourcePageImage),
    ...question.figures.flatMap(figure => figure.original?.sourcePageImage ? [figure.original.sourcePageImage] : []),
  ])];
  // Normal snapshots can contain a filtered page list while source.page still
  // indexes the parent sheet. Prefer the session's explicit map in that case.
  const rawPage = Number.isInteger(question.source?.page) && (question.source?.page ?? 0) > 0 ? question.source?.page : undefined;
  const candidate = rawPage ? (session.entryId.startsWith("generated:")
    ? question.sourcePageImages?.[rawPage - 1]
    : session.sourcePageImages?.[rawPage - 1] ?? question.sourcePageImages?.[rawPage - 1]) : undefined;
  const explicitPages = [...new Set([
    ...mappedPages, ...(question.linkedSourcePageImages ?? []), ...hotspots.map(hotspot => hotspot.sourcePageImage),
    ...question.figures.flatMap(figure => figure.original?.sourcePageImage ? [figure.original.sourcePageImage] : []),
  ])];
  const sourcePage = uniqueQuestion ? (candidate && pages.includes(candidate)
    && (session.sourcePageQuestionMap === undefined || explicitPages.includes(candidate)) ? candidate : explicitPages[0]) : undefined;
  const localPage = sourcePage ? pages.indexOf(sourcePage) + 1 : undefined;
  const segments: QuestionContentSegment[] = [
    ...(question.passage ? [{ id: `exam-${session.id}-${number}-passage`, type: "text" as const, text: question.passage }] : []),
    ...(question.contentSegments?.length ? structuredClone(question.contentSegments) : [
      ...(question.conditions ?? []).map((text, index) => ({ id: `exam-${session.id}-${number}-condition-${index + 1}`, type: "condition" as const, text })),
      ...(question.equations ?? []).map((latex, index) => ({ id: `exam-${session.id}-${number}-equation-${index + 1}`, type: "equation" as const, latex, display: true })),
      ...(question.question ? [{ id: `exam-${session.id}-${number}-text`, type: "text" as const, text: question.question }] : []),
    ]),
  ];
  const figures = [...question.figures];
  for (const figure of question.solutionFigures ?? []) {
    // Never replace a question figure on an ambiguous ID collision.
    if (!figures.some(existing => existing.id === figure.id)) figures.push(figure);
  }
  const answer = uniqueQuestion ? question.solutionAnswer ?? (question.correctAnswer || question.explanation ? {
    id: `exam-${session.id}-${number}-answer`, questionNumber: number,
    answer: question.correctAnswer ?? "", explanation: question.explanation ?? "", importantPoints: [],
  } : undefined) : undefined;
  return {
    sourcePageImages: pages,
    structuredQuestions: [{
      questionNumber: number, section: question.section, questionType: question.questionType,
      questionText: question.question, choices: [...question.choices], conditions: [...(question.conditions ?? [])],
      equations: [...(question.equations ?? [])], contentSegments: segments,
      figureIds: [...(question.figureIds ?? question.figures.map(figure => figure.id))],
      source: question.source || localPage ? { ...question.source, page: localPage } : undefined,
      points: question.points, needsReview: question.needsReview, warning: question.warning,
    }],
    questionContentSegments: { [number]: segments },
    questionSolutionHotspots: hotspots.map(hotspot => ({ ...hotspot, questionKey: solutionQuestionKey({ questionNumber: number, section: question.section }) })),
    answerKey: answer ? [{ ...structuredClone(answer), questionNumber: number }] : [],
    figures: structuredClone(figures),
    supplementalResources: uniqueQuestion && explicitPages.length ? [{
      id: `exam-source-pages-${session.id}-${number}`, kind: "source_pages", title: "시험 문항의 원본 페이지",
      questionNumbers: [number], images: explicitPages, createdAt: session.updatedAt, updatedAt: session.updatedAt,
    }] : [],
  };
}
