import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../../../types";
import { DEFAULT_LEARNING_HUB_FILTERS, filterLearningBlocks, getLearningBlockSearchText, projectLearningBlocks } from "./learningHub";

const entry: WrongAnswerEntry = {
  id: "sheet-1", subject: "수학", title: "미분 문제지", question: "1. 문제", questionImages: [], entryKind: "problem_sheet",
  difficult: false, difficulty: "none", myAnswer: "", correctAnswer: "", explanationParts: [], memo: "", annotations: [], tags: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", mastered: false,
  learningBlocks: [{ id: "block-1", type: "formula", title: "미분 공식", content: "합성함수 미분", unit: "미분", keywords: ["연쇄법칙"], importance: "essential", reviewStatus: "reviewed", sourceQuestionNumber: "1", subjectMetadata: { subject: "math", knowledgeType: "formula", formulaLatex: ["(f(g(x)))'=f'(g(x))g'(x)"], whenToUse: ["합성함수"], avoidWhen: ["단순 합"], solutionSteps: ["안쪽 함수 확인"] } }],
};

describe("learning hub utilities", () => {
  it("projects blocks with a safe subject domain and searches metadata", () => {
    const [item] = projectLearningBlocks([entry]);
    expect(item.domain).toBe("math");
    expect(getLearningBlockSearchText(item)).toContain("연쇄법칙");
    expect(getLearningBlockSearchText(item)).toContain("미분 문제지");
  });

  it("combines subject, unit, importance, review, and search filters", () => {
    const items = projectLearningBlocks([entry]);
    expect(filterLearningBlocks(items, { ...DEFAULT_LEARNING_HUB_FILTERS, domain: "math", unit: "미분", importance: "essential", reviewStatus: "reviewed", search: "연쇄법칙", linkedOnly: true })).toHaveLength(1);
    expect(filterLearningBlocks(items, { ...DEFAULT_LEARNING_HUB_FILTERS, domain: "life_ethics" })).toHaveLength(0);
  });

  it("does not classify a generic social subject as a selected domain", () => {
    const [item] = projectLearningBlocks([{ ...entry, id: "social", subject: "사회" }]);
    expect(item.domain).toBe("general");
  });

  it("filters life ethics thinkers and evidence kinds", () => {
    const ethics = { ...entry, subject: "생활과 윤리", learningBlocks: [{ id: "ethics", type: "concept" as const, title: "의무론", content: "", subjectDomain: "life_ethics" as const, subjectMetadata: { subject: "life_ethics" as const, knowledgeType: "thinker" as const, thinkers: ["칸트"], passageClues: ["보편화"], rejectedClaims: ["결과만 중시"] }, choiceExamples: [{ id: "choice", text: "결과만 중시", verdict: "incorrect" as const }] }] };
    const items = projectLearningBlocks([ethics]);
    expect(filterLearningBlocks(items, { ...DEFAULT_LEARNING_HUB_FILTERS, domain: "life_ethics", thinkers: ["칸트"], lifeEthicsKinds: ["passage_clue"] })).toHaveLength(1);
    expect(filterLearningBlocks(items, { ...DEFAULT_LEARNING_HUB_FILTERS, domain: "life_ethics", thinkers: ["롤스"], lifeEthicsKinds: ["incorrect_choice"] })).toHaveLength(0);
  });
});
