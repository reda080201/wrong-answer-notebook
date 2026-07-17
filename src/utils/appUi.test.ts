import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../types";
import {
  entryKindName,
  getEntryCardPreview,
  imageCount,
  isDifficultyFilter,
  sortEntries,
} from "./appUi";
import { getReviewNeedCount } from "./questionMeta";

const baseEntry: WrongAnswerEntry = {
  id: "1",
  subject: "수학",
  title: "가 항목",
  question: "첫 줄\n둘째 줄",
  questionImages: [],
  entryKind: "wrong_answer",
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

describe("appUi utilities", () => {
  it("sorts entries by title and updated date", () => {
    const older = { ...baseEntry, id: "older", title: "나", updatedAt: "2026-01-01T00:00:00.000Z" };
    const newer = { ...baseEntry, id: "newer", title: "가", updatedAt: "2026-02-01T00:00:00.000Z" };

    expect(sortEntries([older, newer], "date-desc").map((entry) => entry.id)).toEqual(["newer", "older"]);
    expect(sortEntries([older, newer], "title-asc").map((entry) => entry.id)).toEqual(["newer", "older"]);
  });

  it("sorts sheets by question, bookmark, and review need counts", () => {
    const small = {
      ...baseEntry,
      id: "small",
      entryKind: "problem_sheet" as const,
      question: "1. 하나",
      questionMeta: [{ questionNumber: "1", important: true, updatedAt: "2026-01-01T00:00:00.000Z" }],
    };
    const large = {
      ...baseEntry,
      id: "large",
      entryKind: "problem_sheet" as const,
      question: "1. 하나\n\n2. 둘\n\n3. 셋",
      questionMeta: [
        { questionNumber: "1", important: true, updatedAt: "2026-01-01T00:00:00.000Z" },
        { questionNumber: "2", important: true, updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
      answerKey: [{ id: "a", questionNumber: "1", answer: "", explanation: "", importantPoints: [], needsReview: true }],
    };

    expect(sortEntries([small, large], "question-count-desc").map((entry) => entry.id)).toEqual(["large", "small"]);
    expect(sortEntries([small, large], "bookmark-count-desc").map((entry) => entry.id)).toEqual(["large", "small"]);
    expect(sortEntries([small, large], "review-need-count-desc").map((entry) => entry.id)).toEqual(["large", "small"]);
  });

  it("counts answer-key review needs without duplicating normalized question numbers", () => {
    const sheet = {
      ...baseEntry,
      entryKind: "problem_sheet" as const,
      questionMeta: [
        {
          questionNumber: "01",
          important: false,
          needsReview: true,
          review: { dueAt: "2020-01-01T00:00:00.000Z", intervalDays: 1, streak: 0, history: [] },
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        { questionNumber: "2번", important: false, updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
      answerKey: [
        { id: "a1", questionNumber: "1.", answer: "", explanation: "", importantPoints: [], needsReview: true },
        { id: "a2", questionNumber: "02", answer: "", explanation: "", importantPoints: [], needsReview: true },
        { id: "a3", questionNumber: "3", answer: "", explanation: "", importantPoints: [], needsReview: true },
      ],
      importAudit: {
        expectedQuestionNumbers: ["1", "2", "3", "4"],
        detectedQuestionNumbers: ["1", "2", "3"],
        missingQuestionNumbers: ["#1", "2", "4"],
        uncertainQuestionNumbers: [],
        handwritingExcluded: true,
        needsReviewCount: 0,
      },
    };

    expect(getReviewNeedCount(sheet)).toBe(4);
  });

  it("sorts sheets by group title and part order", () => {
    const part2 = {
      ...baseEntry,
      id: "part2",
      entryKind: "problem_sheet" as const,
      title: "파트 2",
      sheetGroup: {
        groupId: "g",
        groupTitle: "ALPHA",
        partTitle: "21~40",
        partOrder: 2,
      },
    };
    const part1 = {
      ...baseEntry,
      id: "part1",
      entryKind: "problem_sheet" as const,
      title: "파트 1",
      sheetGroup: {
        groupId: "g",
        groupTitle: "ALPHA",
        partTitle: "1~20",
        partOrder: 1,
      },
    };

    expect(sortEntries([part2, part1], "part-order-asc").map((entry) => entry.id)).toEqual(["part1", "part2"]);
    expect(sortEntries([part2, part1], "group-title-asc").map((entry) => entry.id)).toEqual(["part2", "part1"]);
  });

  it("sorts entries by resolved difficulty score", () => {
    const explicit = {
      ...baseEntry,
      id: "explicit",
      difficultyScore: 91,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const estimated = {
      ...baseEntry,
      id: "estimated",
      difficulty: "high" as const,
      updatedAt: "2026-02-01T00:00:00.000Z",
    };
    const easy = {
      ...baseEntry,
      id: "easy",
      difficultyScore: 20,
      updatedAt: "2026-03-01T00:00:00.000Z",
    };

    expect(sortEntries([easy, estimated, explicit], "difficulty-score-desc").map((entry) => entry.id)).toEqual([
      "explicit",
      "estimated",
      "easy",
    ]);
    expect(sortEntries([easy, estimated, explicit], "difficulty-score-asc").map((entry) => entry.id)).toEqual([
      "easy",
      "estimated",
      "explicit",
    ]);
  });

  it("builds previews for concept and lecture entries", () => {
    expect(getEntryCardPreview({
      ...baseEntry,
      entryKind: "concept",
      question: "  핵심 개념입니다  ",
    })).toBe("핵심 개념입니다");

    expect(getEntryCardPreview({
      ...baseEntry,
      entryKind: "lecture",
      learningBlocks: [{ id: "b", type: "concept", title: "미분", content: "접선 기울기" }],
    })).toContain("미분 접선 기울기");
  });

  it("maps entry labels and filters difficulty values", () => {
    expect(entryKindName("wrong_answer")).toBe("오답");
    expect(entryKindName("lecture")).toBe("특강자료");
    expect(isDifficultyFilter("high")).toBe(true);
    expect(isDifficultyFilter("urgent")).toBe(false);
  });

  it("counts question and explanation images", () => {
    expect(imageCount({
      ...baseEntry,
      questionImages: ["q.png"],
      explanationParts: [{ id: "p", text: "", images: ["a.png", "b.png"] }],
    })).toBe(3);
  });
});
