import { v4 as uuidv4 } from "uuid";
import type { EntryFormData, ExplanationPart, SheetAnswerItem, WrongAnswerEntry } from "../types";
import { hasExplanationContent } from "./entry";

export type GptSolutionApplyMode = "fill" | "overwrite";

type GptSolutionSource = Pick<
  WrongAnswerEntry,
  "entryKind" | "subject" | "title" | "question" | "questionImages" | "answerKey" | "correctAnswer" | "explanationParts" | "memo"
>;

function hasText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function firstAnswer(imported: Partial<EntryFormData>): SheetAnswerItem | undefined {
  return imported.answerKey?.find(
    (item) => item.answer.trim() || item.explanation.trim() || item.notes?.trim() || item.importantPoints.length,
  );
}

function explanationFromAnswer(answer: SheetAnswerItem | undefined): ExplanationPart[] | undefined {
  if (!answer) return undefined;
  const lines = [
    answer.explanation.trim(),
    answer.notes?.trim(),
    ...answer.importantPoints.map((point) => `- ${point}`),
  ].filter(Boolean);
  if (!lines.length) return undefined;
  return [{ id: uuidv4(), text: lines.join("\n"), images: [] }];
}

function mergeAnswerKey(
  base: SheetAnswerItem[] | undefined,
  imported: SheetAnswerItem[] | undefined,
  mode: GptSolutionApplyMode,
): SheetAnswerItem[] | undefined {
  if (!imported?.length) return base;
  if (mode === "overwrite" || !base?.length) return imported;

  const next = base.map((item) => ({ ...item, importantPoints: [...item.importantPoints] }));
  for (const incoming of imported) {
    const matchIndex = next.findIndex(
      (item) => item.questionNumber.trim() === incoming.questionNumber.trim(),
    );
    if (matchIndex < 0) {
      next.push(incoming);
      continue;
    }
    const current = next[matchIndex];
    next[matchIndex] = {
      ...current,
      answer: current.answer.trim() ? current.answer : incoming.answer,
      explanation: current.explanation.trim() ? current.explanation : incoming.explanation,
      notes: current.notes?.trim() ? current.notes : incoming.notes,
      importantPoints: current.importantPoints.length ? current.importantPoints : incoming.importantPoints,
      concepts: current.concepts?.length ? current.concepts : incoming.concepts,
      difficulty: current.difficulty ?? incoming.difficulty,
      needsReview: current.needsReview || incoming.needsReview,
      sourceNote: current.sourceNote?.trim() ? current.sourceNote : incoming.sourceNote,
    };
  }
  return next;
}

export function buildMathSolutionPrompt(entry: GptSolutionSource): string {
  const isSheet = entry.entryKind === "problem_sheet";
  const imageGuide = entry.questionImages.length
    ? `첨부 이미지 ${entry.questionImages.length}개를 함께 확인해줘.`
    : "첨부 이미지가 없으면 아래 텍스트만 기준으로 풀이해줘.";

  return `수학 문제를 오답노트 앱에 넣을 해설 JSON으로 정리해줘.

규칙:
- 반드시 순수 JSON 객체 1개만 출력해줘. 첫 글자는 {, 마지막 글자는 } 이어야 해.
- 설명문, Markdown, 코드블록, 파일 안내 문구는 넣지 마.
- tags 필드는 만들지 마.
- 문제를 못 읽겠거나 답이 불확실하면 needsReview를 true로 표시해줘.
- 수식은 가능한 한 LaTeX 문자열로 깔끔하게 적어줘.
- 풀이 과정은 학생이 다시 봐도 이해되도록 단계별로 써줘.
- 전체 메모는 memo나 importantNotes에 넣고, 특정 문항에만 해당하는 메모는 반드시 answerKey[].notes에 넣어줘.
- 핵심 개념, 자주 하는 실수, 검산 포인트는 문항별이면 answerKey[].importantPoints에 넣어줘.
- ${imageGuide}

출력 형식:
{
  "title": "문제 제목",
  "subject": "수학",
  "question": "문제 원문",
  "correctAnswer": "정답",
  "explanationParts": [
    { "id": "solution-1", "text": "단계별 풀이", "images": [] }
  ],
  "memo": "핵심 개념과 자주 하는 실수",
  "importantNotes": ["검산 포인트"],
  "answerKey": [
    {
      "questionNumber": "${isSheet ? "1" : "1"}",
      "answer": "정답",
      "explanation": "단계별 풀이",
      "notes": "이 문항에서만 다시 볼 메모",
      "importantPoints": ["핵심 개념", "자주 하는 실수"],
      "needsReview": false
    }
  ]
}

현재 항목:
- 제목: ${entry.title || "(제목 없음)"}
- 과목: ${entry.subject}
- 유형: ${isSheet ? "시험지" : "단일 오답"}
- 문제 텍스트:
${entry.question || "(이미지만 첨부됨)"}`;
}

export function mergeGptSolutionIntoEntry(
  base: EntryFormData,
  imported: Partial<EntryFormData>,
  mode: GptSolutionApplyMode,
): EntryFormData {
  const incomingAnswer = firstAnswer(imported);
  const incomingExplanationParts =
    imported.explanationParts?.filter((part) => part.text.trim() || part.images.length) ??
    explanationFromAnswer(incomingAnswer) ??
    [];
  const shouldOverwrite = mode === "overwrite";
  const baseHasExplanation = base.explanationParts.some((part) => part.text.trim() || part.images.length);

  return {
    ...base,
    title: shouldOverwrite || !hasText(base.title) ? imported.title ?? base.title : base.title,
    subject: imported.subject ?? base.subject,
    question: shouldOverwrite || !hasText(base.question) ? imported.question ?? base.question : base.question,
    correctAnswer:
      shouldOverwrite || !hasText(base.correctAnswer)
        ? imported.correctAnswer || incomingAnswer?.answer || base.correctAnswer
        : base.correctAnswer,
    explanationParts:
      (shouldOverwrite || !baseHasExplanation) && incomingExplanationParts.length
        ? incomingExplanationParts
        : base.explanationParts,
    memo: shouldOverwrite || !hasText(base.memo) ? imported.memo ?? base.memo : base.memo,
    answerKey: mergeAnswerKey(base.answerKey, imported.answerKey, mode),
    questionImages: base.questionImages,
    entryKind: base.entryKind,
    tags: base.tags,
  };
}

export function entryToFormData(entry: WrongAnswerEntry): EntryFormData {
  return {
    subject: entry.subject,
    title: entry.title,
    question: entry.question,
    questionImages: [...entry.questionImages],
    entryKind: entry.entryKind,
    difficult: entry.difficult,
    difficulty: entry.difficulty ?? "none",
    myAnswer: entry.myAnswer,
    correctAnswer: entry.correctAnswer,
    explanationParts: hasExplanationContent(entry)
      ? entry.explanationParts.map((part) => ({ ...part, images: [...part.images] }))
      : [{ id: uuidv4(), text: "", images: [] }],
    memo: entry.memo,
    annotations: [...(entry.annotations ?? [])],
    tags: [...entry.tags],
    answerKey: (entry.answerKey ?? []).map((item) => ({
      ...item,
      importantPoints: [...item.importantPoints],
      concepts: item.concepts ? [...item.concepts] : [],
    })),
    mastered: entry.mastered,
    review: entry.review,
    checklist: entry.checklist ? entry.checklist.map((item) => ({ ...item })) : [],
  };
}
