/**
 * Copyright-free structural stand-in for the local K7 import smoke archive.
 * It preserves only the import contract: counts, placements and warnings.
 */
export function createKangdaeK7SyntheticImport() {
  const figureNumbers = [4, 11, 14, 15, 15, 20, 21, 25, 28, 29, 29];
  const figures = figureNumbers.map((questionNumber, index) => ({
    id: `fig-${index + 1}`,
    questionNumber: String(questionNumber),
    title: `합성 도형 ${index + 1}`,
    caption: "합성 fixture 도형",
    source: "original",
    representations: {
      original: { image: `images/q${questionNumber}-original-${index + 1}.png` },
      cleaned: {
        image: `images/q${questionNumber}-cleaned-${index + 1}.png`,
        generatedBy: "gpt",
        generatedAt: "2026-01-01T00:00:00.000Z",
        sourceImageHash: `fixture-${index + 1}`,
        promptVersion: "fixture-v1",
      },
    },
    preferredRepresentation: "original",
    placement: { questionNumber: String(questionNumber), afterSegmentId: `segment-q${questionNumber}-1`, order: index },
  }));

  const questions = Array.from({ length: 30 }, (_, index) => {
    const questionNumber = String(index + 1);
    const missingDetails = index >= 10 && index <= 13;
    const figureIds = figures.filter((figure) => figure.questionNumber === questionNumber).map((figure) => figure.id);
    return {
      questionNumber,
      questionText: `합성 ${questionNumber}번 문제에서 f(${questionNumber}, x/y)를 구하시오.`,
      conditions: [`조건 ${questionNumber}: x > 0`],
      equations: ["\\frac{1}{2} + \\sqrt{x}"],
      choices: missingDetails ? [] : ["① 1/2", "② x/y", "③ 3", "④ 4", "⑤ 5"],
      contentSegments: [
        { id: `segment-q${questionNumber}-1`, type: "text", text: `합성 ${questionNumber}번 본문` },
        ...figureIds.map((figureId) => ({ id: `segment-${figureId}`, type: "figure", figureId })),
      ],
      figureIds,
      ...(missingDetails ? { needsReview: true, warning: "원본 자료의 선택지와 배점 확인 필요" } : { points: 2 }),
    };
  });

  return {
    schemaVersion: "wrong-answer-notebook-import-v2",
    importType: "problem_sheet",
    entries: [{
      entryKind: "problem_sheet",
      title: "합성 강대 K 7회",
      subject: "수학",
      questions,
      answerKey: Array.from({ length: 30 }, (_, index) => ({
        questionNumber: String(index + 1), answer: "①", explanation: `합성 ${index + 1}번 해설`,
      })),
      figures,
    }],
  };
}

export function getKangdaeK7SyntheticImagePaths(importData: ReturnType<typeof createKangdaeK7SyntheticImport>): string[] {
  return importData.entries.flatMap((entry) => entry.figures.flatMap((figure) => [
    figure.representations.original.image,
    figure.representations.cleaned.image,
  ]));
}
