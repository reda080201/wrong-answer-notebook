import { describe, expect, it } from "vitest";
import { parseImportedStudyText } from "./importStudyText";
import { createExamSession } from "../features/exam/services/examSession";
import type { WrongAnswerEntry } from "../types";

describe("figure token import and exam projection", () => {
  it("preserves figure references in body, condition, passage, and choices with their positions", () => {
    const question = [
      "[자료]",
      "공통 자료 [FIGURE:passage-figure] 뒤 문장",
      "",
      "1. (가) 조건 앞 [FIGURE:body-figure] 조건 뒤",
      "① [FIGURE:choice-figure]를 참고한 선택지",
      "② 일반 선택지",
    ].join("\n");
    const parsed = parseImportedStudyText(JSON.stringify({
      entryKind: "problem_sheet",
      title: "그림 위치 연결",
      subject: "수학",
      question,
      figures: [
        { id: "passage-figure", questionNumber: "", title: "공통 그림", image: "passage.png", source: "original" },
        { id: "body-figure", questionNumber: "1", title: "조건 그림", image: "body.png", source: "original" },
        { id: "choice-figure", questionNumber: "1", title: "선택지 그림", image: "choice.png", source: "original" },
      ],
      answerKey: [{ questionNumber: "1", answer: "①", explanation: "" }],
    }));

    expect(parsed.data.question).toContain("[FIGURE:passage-figure]");
    expect(parsed.data.question).toContain("[FIGURE:body-figure]");
    expect(parsed.data.question).toContain("[FIGURE:choice-figure]");
    const segments = parsed.data.questionContentSegments?.["1"] ?? [];
    expect(segments.map((segment) => segment.type === "figure" ? `figure:${segment.figureId}` : segment.type)).toEqual([
      "condition", "figure:body-figure", "condition",
    ]);
    expect(segments.filter((segment) => segment.type === "condition" && segment.label === "(가)")).toHaveLength(1);

    const entry = {
      ...parsed.data,
      id: "figure-roundtrip",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      questionImages: [],
      difficult: false,
      difficulty: "none",
      myAnswer: "",
      correctAnswer: "",
      explanationParts: [],
      memo: "",
      annotations: [],
      tags: [],
      mastered: false,
    } as unknown as WrongAnswerEntry;
    const session = createExamSession(entry, new Date("2026-01-01T00:00:00.000Z"), { mode: "real" });
    expect(session.questions[0]?.passage).toContain("[FIGURE:passage-figure]");
    expect(session.questions[0]?.choices[0]).toContain("[FIGURE:choice-figure]");
    expect(session.questions[0]?.figures.map((figure) => figure.id).sort()).toEqual(["body-figure", "choice-figure", "passage-figure"]);
    expect(session.questions[0]?.needsReview).toBe(false);
  });

  it("keeps intentional repeated figure positions and warns for missing or empty IDs", () => {
    const parsed = parseImportedStudyText(JSON.stringify({
      entryKind: "problem_sheet",
      question: "1. (가) 앞 [FIGURE:repeat] 중간 [FIGURE:repeat] 뒤 [FIGURE:]",
      figures: [{ id: "repeat", questionNumber: "1", title: "반복 그림", image: "repeat.png", source: "original" }],
    }));
    const segments = parsed.data.questionContentSegments?.["1"] ?? [];
    expect(segments.filter((segment) => segment.type === "figure" && segment.figureId === "repeat")).toHaveLength(2);
    expect(parsed.data.question).toContain("[FIGURE:]");

    const entry = {
      ...parsed.data,
      id: "bad-figure-reference",
      title: "검토 필요",
      subject: "수학",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      questionImages: [],
      difficult: false,
      difficulty: "none",
      myAnswer: "",
      correctAnswer: "",
      explanationParts: [],
      memo: "",
      annotations: [],
      tags: [],
      mastered: false,
    } as unknown as WrongAnswerEntry;
    const snapshot = createExamSession(entry).questions[0];
    expect(snapshot?.needsReview).toBe(true);
    expect(snapshot?.warning).toContain("그림 ID");
  });
});
