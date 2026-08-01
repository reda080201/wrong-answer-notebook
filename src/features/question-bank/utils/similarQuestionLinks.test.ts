import { describe, expect, it } from "vitest";
import type { QuestionBankItem } from "../model/questionBankTypes";
import type { WrongAnswerEntry } from "../../../types";
import { buildSimilarQuestionContext, parseGeminiSimilarQuestionRanking, rankLocalSimilarQuestions } from "./similarQuestionLinks";

const item = (id: string, number: string, unit: string, concepts: string[]): QuestionBankItem => ({
  id: `${id}:${number}`, entryId: id, entryTitle: id, entryKind: "problem_sheet", questionNumber: number,
  subject: "수학", questionText: "문제", source: { type: "unknown" },
  classification: { subject: "수학", sourceType: "unknown", unit, concepts, answerType: "unknown", isPastExam: false },
  questionImages: [], sourcePageImages: [], hasAnswer: true, hasExplanation: true, hasImages: false,
  isWrong: false, isMastered: false, reviewDue: false, updatedAt: "2026-01-01T00:00:00Z",
});

describe("similar question links", () => {
  it("ranks same-unit and shared-concept candidates while excluding source", () => {
    const context = buildSimilarQuestionContext({ id: "source", entryKind: "concept", title: "함수", question: "", subject: "수학", questionImages: [], difficult: false, myAnswer: "", correctAnswer: "", explanationParts: [], createdAt: "", updatedAt: "", learningBlocks: [{ id: "b", type: "concept", title: "함수", content: "", unit: "미분", relatedConcepts: ["도함수"] }] } as unknown as WrongAnswerEntry);
    context.subject = "수학";
    context.unit = "미분";
    context.concepts = ["도함수"];
    const ranked = rankLocalSimilarQuestions(context, [item("source", "1", "미분", ["도함수"]), item("other", "01", "미분", ["도함수"]), item("other2", "2", "확률", [])]);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].candidate.id).toBe("other:01");
    expect(ranked[0].score).toBeGreaterThan(25);
  });

  it("accepts only allowed candidate ids and clamps duplicate results", () => {
    const result = parseGeminiSimilarQuestionRanking({ results: [{ candidateId: "entry:15", score: 120 }, { candidateId: "entry:15", score: 5 }, { candidateId: "other:1", score: 90 }] }, new Set(["entry:15"]));
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(100);
  });

  it("excludes only the source question when a question target is known", () => {
    const ranked = rankLocalSimilarQuestions({
      sourceId: "source", sourceQuestionNumber: "1", subject: "수학", unit: "미분", concepts: [], tags: [], keywords: [], text: "",
    }, [item("source", "1", "미분", []), item("source", "2", "미분", []), item("other", "1", "미분", [])]);
    expect(ranked.map((candidate) => candidate.candidate.id)).toEqual(["other:1", "source:2"]);
  });
});
