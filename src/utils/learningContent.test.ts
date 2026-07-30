import { describe, expect, it } from "vitest";
import { buildLearningBlocksFromEntry, parseLearningImportText, sanitizeHtmlToLearningBlocks } from "./learningContent";
import type { WrongAnswerEntry } from "../types";

const entry: WrongAnswerEntry = {
  id: "entry-1",
  subject: "수학",
  title: "함수",
  question: "1. 문제",
  questionImages: [],
  entryKind: "problem_sheet",
  difficult: false,
  difficulty: "none",
  myAnswer: "",
  correctAnswer: "",
  explanationParts: [],
  memo: "",
  annotations: [],
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  mastered: false,
};

describe("learning content utilities", () => {
  it("builds learning blocks from structured answer fields", () => {
    const blocks = buildLearningBlocksFromEntry({
      ...entry,
      answerKey: [
        {
          id: "answer-1",
          questionNumber: "1",
          answer: "③",
          explanation: "풀이",
          strategy: "그래프 교점 확인",
          steps: ["조건 정리", "대입"],
          wrongPoint: "절편 혼동",
          reviewPoint: "교점과 절편 차이 복습",
          importantPoints: [],
          concepts: ["함수"],
        },
      ],
    });

    expect(blocks.map((block) => block.type)).toEqual(["concept", "formula", "routine", "warning", "review"]);
    expect(blocks.map((block) => block.content).join("\n")).toContain("그래프 교점 확인");
  });

  it("sanitizes html into text learning blocks without raw unsafe nodes", () => {
    const blocks = sanitizeHtmlToLearningBlocks(`
      <h1>함수 특강</h1>
      <script>alert(1)</script>
      <iframe src="https://example.com"></iframe>
      <svg><text>raw svg</text></svg>
      <p>$f(x)$ 그래프를 확인한다.</p>
      <ul><li>교점 표시</li></ul>
    `);

    const text = blocks.map((block) => `${block.title}\n${block.content}`).join("\n");
    expect(text).toContain("함수 특강");
    expect(text).toContain("$f(x)$ 그래프");
    expect(text).toContain("교점 표시");
    expect(text).not.toContain("alert(1)");
    expect(text).not.toContain("raw svg");
  });

  it("parses learningBlocks json", () => {
    const blocks = parseLearningImportText(
      JSON.stringify({
        learningBlocks: [{ type: "routine", title: "루틴", content: "1. 조건 정리" }],
      }),
      "lecture.json",
    );

    expect(blocks).toEqual([
      expect.objectContaining({ type: "routine", title: "루틴", content: "1. 조건 정리" }),
    ]);
  });

  it("uses the canonical concept type when an imported block omits type", () => {
    const blocks = parseLearningImportText(
      JSON.stringify({ learningBlocks: [{ title: "핵심", content: "정의" }] }),
      "lecture.json",
    );

    expect(blocks[0]).toEqual(expect.objectContaining({ type: "concept", title: "핵심" }));
  });

  it("preserves optional learning hub metadata from JSON imports", () => {
    const blocks = parseLearningImportText(JSON.stringify({
      learningBlocks: [{
        title: "합성함수 미분",
        content: "안쪽 함수를 먼저 미분한다.",
        subjectDomain: "math",
        unit: "미분",
        keywords: ["연쇄법칙"],
        importance: "essential",
        reviewStatus: "reviewed",
        subjectMetadata: { subject: "math", knowledgeType: "formula", formulaLatex: ["f(g(x))"] },
      }],
    }), "lecture.json");

    expect(blocks[0]).toEqual(expect.objectContaining({
      subjectDomain: "math",
      unit: "미분",
      keywords: ["연쇄법칙"],
      importance: "essential",
      reviewStatus: "reviewed",
      subjectMetadata: expect.objectContaining({ subject: "math" }),
    }));
  });
});
