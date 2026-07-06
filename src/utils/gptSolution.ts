import { v4 as uuidv4 } from "uuid";
import type { EntryFormData, ExplanationPart, SheetAnswerItem, WrongAnswerEntry } from "../types";
import { hasExplanationContent } from "./entry";

export type GptSolutionApplyMode = "fill" | "overwrite";

type GptSolutionSource = Pick<
  WrongAnswerEntry,
  "entryKind" | "subject" | "title" | "question" | "questionImages" | "answerKey" | "correctAnswer" | "explanationParts" | "memo" | "learningBlocks"
>;

function hasText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function cloneDiagramSpec<T extends SheetAnswerItem["diagramSpec"]>(spec: T): T {
  return spec ? ({ ...spec, highlights: spec.highlights ? [...spec.highlights] : undefined } as T) : spec;
}

function firstAnswer(imported: Partial<EntryFormData>): SheetAnswerItem | undefined {
  return imported.answerKey?.find(
    (item) =>
      item.answer.trim() ||
      item.explanation.trim() ||
      item.strategy?.trim() ||
      item.steps?.length ||
      item.choiceJudgements?.length ||
      item.wrongPoint?.trim() ||
      item.reviewPoint?.trim() ||
      item.diagramType ||
      item.diagramSpec ||
      item.notes?.trim() ||
      item.importantPoints.length,
  );
}

function explanationFromAnswer(answer: SheetAnswerItem | undefined): ExplanationPart[] | undefined {
  if (!answer) return undefined;
  const lines = [
    answer.explanation.trim(),
    answer.strategy?.trim(),
    ...(answer.steps ?? []),
    ...(answer.choiceJudgements ?? []).map((item) => [item.marker, item.text].filter(Boolean).join(": ")),
    answer.wrongPoint?.trim(),
    answer.reviewPoint?.trim(),
    answer.diagramType ? `다이어그램: ${answer.diagramType}` : undefined,
    answer.diagramSpec ? `다이어그램: ${answer.diagramSpec.title || answer.diagramSpec.type}` : undefined,
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

  const next: SheetAnswerItem[] = base.map((item) => ({
    ...item,
    importantPoints: [...item.importantPoints],
    steps: item.steps ? [...item.steps] : undefined,
    choiceJudgements: item.choiceJudgements ? item.choiceJudgements.map((judgement) => ({ ...judgement })) : undefined,
  }));
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
      strategy: current.strategy?.trim() ? current.strategy : incoming.strategy,
      steps: current.steps?.length ? current.steps : incoming.steps,
      choiceJudgements: current.choiceJudgements?.length ? current.choiceJudgements : incoming.choiceJudgements,
      wrongPoint: current.wrongPoint?.trim() ? current.wrongPoint : incoming.wrongPoint,
      reviewPoint: current.reviewPoint?.trim() ? current.reviewPoint : incoming.reviewPoint,
      notes: current.notes?.trim() ? current.notes : incoming.notes,
      importantPoints: current.importantPoints.length ? current.importantPoints : incoming.importantPoints,
      concepts: current.concepts?.length ? current.concepts : incoming.concepts,
      diagramType: current.diagramType ?? incoming.diagramType,
      diagramSpec: current.diagramSpec ?? incoming.diagramSpec,
      difficulty: current.difficulty ?? incoming.difficulty,
      difficultyScore: current.difficultyScore ?? incoming.difficultyScore,
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
- 학생 손글씨, 밑줄, 별표, 여백 메모, 학생 풀이 흔적은 question, answerKey, memo에 넣지 말고 rejectedNotes에만 기록해줘.
- audit에 expectedQuestionNumbers, detectedQuestionNumbers, missingQuestionNumbers, uncertainQuestionNumbers, handwritingExcluded, needsReviewCount를 기록해줘.
- 수식은 가능한 한 LaTeX 문자열로 깔끔하게 적어줘.
- answerKey[].explanation에는 원문 해설 전체를 보관하고, 풀이 구조는 strategy, steps, choiceJudgements, wrongPoint, reviewPoint로 나눠줘.
- 각 문항마다 answerKey[].difficultyScore를 1~100 정수로 추정해줘. 1~30은 쉬운 기본 개념, 31~60은 보통, 61~85는 어려운 응용/킬러급 접근, 86~100은 매우 어려운 고난도/복합 사고 문제야.
- difficultyScore는 계산량만 보지 말고 개념 복합도, 조건 해석 난이도, 발상 필요성, 실수 유발성, 수능/내신 기준 체감 난이도를 함께 고려해줘.
- answerKey[].concepts, strategy, steps, choiceJudgements, wrongPoint, reviewPoint는 앱의 "학습 내용" 카드에 직접 표시되므로 가능한 한 비우지 말고 문항별로 구체적으로 채워줘.
- concepts는 단원명/공식명/핵심 개념명만 짧게 넣고, strategy는 한 문장 풀이 전략, steps는 학생이 다시 봐도 이해되도록 단계별 배열로 써줘.
- wrongPoint는 틀리기 쉬운 지점, reviewPoint는 다음 복습 때 확인할 행동으로 써줘.
- 도표/그래프/기하 그림이 있는 문항은 figures 설명만으로 끝내지 말고, 가능하면 learningBlocks[].type을 "diagram"으로 만들고 diagramSpec을 함께 채워줘.
- 시각화가 도움이 되는 문항은 answerKey[].diagramSpec 또는 learningBlocks[].diagramSpec에 허용 타입, 라벨, params를 넣어줘. 허용 type은 "derivative-tangent", "absolute-value-corner", "piecewise-differentiability", "coordinate-graph", "normal-distribution", "probability-tree", "venn-diagram", "geometry-helper", "trig-unit-circle", "sequence-flow"뿐이야.
- diagramSpec.params에는 점, 선, 원, 축, 함수식, 강조 대상, 라벨, 핵심 관계를 넣어줘. 설명만 하지 말고 앱이 React SVG로 그릴 수 있을 정도로 구조화해줘.
- diagramSpec은 실제 이해에 도움이 되는 경우에만 만들고, 단순 계산 문제에는 만들지 마. 한 문항당 최대 1개, 전체 entry learningBlocks diagram은 최대 3개까지만 허용해.
- 실제 이미지 파일명이 없으면 figures[].source는 "described_only"로 둬. figures[].source가 "original"이면 반드시 image 파일명을 함께 넣어줘.
- diagramType은 구버전 호환용으로만 써도 되고, 가능하면 diagramSpec을 우선 사용해줘.
- raw HTML, raw SVG, Canvas 코드, base64 이미지, script, iframe 문자열은 절대 넣지 마.
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
  "rejectedNotes": [],
  "audit": {
    "expectedQuestionNumbers": ["1"],
    "detectedQuestionNumbers": ["1"],
    "missingQuestionNumbers": [],
    "uncertainQuestionNumbers": [],
    "handwritingExcluded": true,
    "needsReviewCount": 0
  },
  "answerKey": [
    {
      "questionNumber": "${isSheet ? "1" : "1"}",
      "answer": "정답",
      "difficulty": "high",
      "difficultyScore": 87,
      "explanation": "원문 해설 전체",
      "strategy": "핵심 조건을 식으로 바꾼 뒤 대입한다",
      "steps": ["조건을 정리한다", "식을 세운다", "정답을 검산한다"],
      "choiceJudgements": [
        { "marker": "①", "text": "조건 A를 만족하지 않는다" }
      ],
      "wrongPoint": "부호를 반대로 해석하기 쉽다",
      "reviewPoint": "조건을 식으로 옮기는 연습",
      "notes": "이 문항에서만 다시 볼 메모",
      "importantPoints": ["핵심 개념", "자주 하는 실수"],
      "concepts": ["일차함수", "조건 해석"],
      "diagramSpec": {
        "diagramType": "geometry-helper",
        "title": "원과 직선 시각화",
        "params": {
          "coordinatePlane": true,
          "objects": [
            { "type": "circle", "center": [0, 0], "radius": 2, "label": "x^2+y^2=4" },
            { "type": "line", "equation": "y=tx+t", "label": "y=tx+t" }
          ],
          "points": [
            { "id": "P", "role": "upper intersection" },
            { "id": "Q", "role": "lower intersection" }
          ],
          "segments": [
            { "from": "P", "to": "R", "style": "horizontal", "label": "PR" },
            { "from": "Q", "to": "S", "style": "horizontal", "label": "QS" }
          ],
          "highlight": ["PR", "QS"],
          "coreIdea": "수평현 길이 차를 교점의 x좌표 차로 바꾸어 극한을 계산한다."
        }
      },
      "needsReview": false
    }
  ],
  "learningBlocks": [
    {
      "type": "diagram",
      "title": "접선과 미분계수 시각화",
      "content": "$f'(a)$는 x=a에서의 접선 기울기이다.",
      "sourceQuestionNumber": "1",
      "diagramType": "geometry-helper",
      "diagramSpec": {
        "diagramType": "geometry-helper",
        "title": "원과 직선 시각화",
        "params": {
          "objects": [
            { "type": "circle", "center": [0, 0], "radius": 2, "label": "x^2+y^2=4" },
            { "type": "line", "equation": "y=tx+t", "label": "y=tx+t" }
          ],
          "highlight": ["PR", "QS"],
          "coreIdea": "교점의 위치와 수평현 길이를 연결한다."
        }
      }
    }
  ],
  "figures": [
    {
      "questionNumber": "1",
      "title": "1번 원과 직선",
      "caption": "원과 직선의 교점 및 수평현 PR, QS를 비교한다.",
      "image": "",
      "source": "described_only",
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
    difficultyScore:
      shouldOverwrite || base.difficultyScore === undefined
        ? imported.difficultyScore ?? base.difficultyScore
        : base.difficultyScore,
    answerKey: mergeAnswerKey(base.answerKey, imported.answerKey, mode),
    learningBlocks:
      shouldOverwrite || !(base.learningBlocks?.length)
        ? imported.learningBlocks ?? base.learningBlocks
        : base.learningBlocks,
    importAudit: imported.importAudit ?? base.importAudit,
    rejectedNotes: imported.rejectedNotes?.length ? imported.rejectedNotes : base.rejectedNotes,
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
    difficultyScore: entry.difficultyScore,
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
      diagramType: item.diagramType,
      diagramSpec: cloneDiagramSpec(item.diagramSpec),
      steps: item.steps ? [...item.steps] : undefined,
      choiceJudgements: item.choiceJudgements ? item.choiceJudgements.map((judgement) => ({ ...judgement })) : undefined,
    })),
    figures: (entry.figures ?? []).map((figure) => ({ ...figure })),
    learningBlocks: (entry.learningBlocks ?? []).map((block) => ({
      ...block,
      diagramSpec: cloneDiagramSpec(block.diagramSpec),
    })),
    importAudit: entry.importAudit ? {
      ...entry.importAudit,
      expectedQuestionNumbers: [...entry.importAudit.expectedQuestionNumbers],
      detectedQuestionNumbers: [...entry.importAudit.detectedQuestionNumbers],
      missingQuestionNumbers: [...entry.importAudit.missingQuestionNumbers],
      uncertainQuestionNumbers: [...entry.importAudit.uncertainQuestionNumbers],
    } : undefined,
    rejectedNotes: [...(entry.rejectedNotes ?? [])],
    mastered: entry.mastered,
    review: entry.review,
    checklist: entry.checklist ? entry.checklist.map((item) => ({ ...item })) : [],
  };
}
