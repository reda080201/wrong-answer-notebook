import { describe, expect, it } from "vitest";
import type { EntryFormData, WrongAnswerEntry } from "../types";
import {
  buildMathSolutionPrompt,
  entryToFormData,
  mergeGptSolutionIntoEntry,
} from "./gptSolution";

const entry: WrongAnswerEntry = {
  id: "entry-1",
  subject: "수학",
  title: "이차방정식",
  question: "x^2 - 1 = 0",
  questionImages: ["q1.png"],
  entryKind: "wrong_answer",
  difficult: false,
  difficulty: "none",
  myAnswer: "",
  correctAnswer: "",
  explanationParts: [{ id: "empty", text: "", images: [] }],
  memo: "",
  annotations: [],
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  mastered: false,
};

describe("gptSolution", () => {
  it("builds a math solution prompt without tags instructions", () => {
    const prompt = buildMathSolutionPrompt(entry);

    expect(prompt).toContain("순수 JSON 객체 1개");
    expect(prompt).toContain("단계별");
    expect(prompt).toContain("needsReview");
    expect(prompt).toContain("answerKey[].notes");
    expect(prompt).toContain("strategy, steps, choiceJudgements, wrongPoint, reviewPoint");
    expect(prompt).toContain("learningBlocks");
    expect(prompt).toContain("diagramSpec");
    expect(prompt).toContain("derivative-tangent");
    expect(prompt).toContain("coordinate-graph");
    expect(prompt).toContain("sequence-flow");
    expect(prompt).toContain('learningBlocks[].type을 "diagram"');
    expect(prompt).toContain("한 문항당 최대 1개");
    expect(prompt).toContain("전체 entry learningBlocks diagram은 최대 3개");
    expect(prompt).toContain("figures[].source는 \"described_only\"");
    expect(prompt).toContain("Canvas 코드");
    expect(prompt).toContain("raw HTML, raw SVG");
    expect(prompt).toContain("diagramSpec.params");
    expect(prompt).toContain("geometry-helper");
    expect(prompt).toContain("coreIdea");
    expect(prompt).toContain("x^2+y^2=4");
    expect(prompt).toContain("첨부 이미지 1개");
    expect(prompt).toContain("tags 필드는 만들지 마");
    expect(prompt).not.toContain('"tags"');
  });

  it("fills only empty answer and explanation fields", () => {
    const base = entryToFormData(entry);
    const imported: Partial<EntryFormData> = {
      correctAnswer: "x = ±1",
      explanationParts: [{ id: "solution", text: "양변을 인수분해한다.", images: [] }],
      memo: "인수분해 확인",
    };

    const merged = mergeGptSolutionIntoEntry(base, imported, "fill");

    expect(merged.correctAnswer).toBe("x = ±1");
    expect(merged.explanationParts[0].text).toBe("양변을 인수분해한다.");
    expect(merged.memo).toBe("인수분해 확인");
  });

  it("does not overwrite existing fields in fill mode", () => {
    const base = entryToFormData({
      ...entry,
      correctAnswer: "기존 정답",
      explanationParts: [{ id: "old", text: "기존 풀이", images: [] }],
      memo: "기존 메모",
    });

    const merged = mergeGptSolutionIntoEntry(
      base,
      {
        correctAnswer: "새 정답",
        explanationParts: [{ id: "new", text: "새 풀이", images: [] }],
        memo: "새 메모",
      },
      "fill",
    );

    expect(merged.correctAnswer).toBe("기존 정답");
    expect(merged.explanationParts[0].text).toBe("기존 풀이");
    expect(merged.memo).toBe("기존 메모");
  });

  it("overwrites existing fields in overwrite mode", () => {
    const base = entryToFormData({
      ...entry,
      correctAnswer: "기존 정답",
      explanationParts: [{ id: "old", text: "기존 풀이", images: [] }],
    });

    const merged = mergeGptSolutionIntoEntry(
      base,
      {
        correctAnswer: "새 정답",
        explanationParts: [{ id: "new", text: "새 풀이", images: [] }],
      },
      "overwrite",
    );

    expect(merged.correctAnswer).toBe("새 정답");
    expect(merged.explanationParts[0].text).toBe("새 풀이");
  });

  it("preserves existing answer notes in fill mode", () => {
    const base = {
      ...entryToFormData(entry),
      entryKind: "problem_sheet" as const,
      answerKey: [
        {
          id: "a1",
          questionNumber: "1",
          answer: "",
          explanation: "",
          notes: "기존 문제별 메모",
          importantPoints: [],
        },
      ],
    };

    const merged = mergeGptSolutionIntoEntry(
      base,
      {
        answerKey: [
          {
            id: "incoming",
            questionNumber: "1",
            answer: "②",
            explanation: "새 풀이",
            notes: "새 문제별 메모",
            importantPoints: ["핵심"],
          },
        ],
      },
      "fill",
    );

    expect(merged.answerKey?.[0].notes).toBe("기존 문제별 메모");
    expect(merged.answerKey?.[0].answer).toBe("②");
  });

  it("fills structured answer fields without overwriting existing structured fields", () => {
    const base = {
      ...entryToFormData(entry),
      entryKind: "problem_sheet" as const,
      answerKey: [
        {
          id: "a1",
          questionNumber: "1",
          answer: "",
          explanation: "",
          strategy: "기존 전략",
          importantPoints: [],
        },
      ],
    };

    const merged = mergeGptSolutionIntoEntry(
      base,
      {
        answerKey: [
          {
            id: "incoming",
            questionNumber: "1",
            answer: "②",
            explanation: "원문 해설",
            strategy: "새 전략",
            steps: ["조건 정리", "대입"],
            choiceJudgements: [{ marker: "①", text: "조건 불일치" }],
            wrongPoint: "부호 실수",
            reviewPoint: "부호 확인",
            importantPoints: [],
          },
        ],
      },
      "fill",
    );

    expect(merged.answerKey?.[0]).toEqual(
      expect.objectContaining({
        strategy: "기존 전략",
        steps: ["조건 정리", "대입"],
        choiceJudgements: [{ marker: "①", text: "조건 불일치" }],
        wrongPoint: "부호 실수",
        reviewPoint: "부호 확인",
      }),
    );
  });
});
