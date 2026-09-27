import { describe, expect, it } from "vitest";
import fixture from "../../../test/fixtures/text-figures-answer-link.json";
import { parseImportedStudyText } from "../../../utils/importStudyText";
import { mapEntryImportImageReferences } from "../../../utils/importImageReferences";
import { normalizeEntry } from "../../../utils/entry";
import type { WrongAnswerEntry } from "../../../types";
import { createExamSession, publicExamQuestion, updateExamResponse } from "./examSession";
import { scoreExamSession } from "./examScoring";
import { getEntryQuestions } from "../../../utils/entryQuestions";

function importEntry(payload: unknown) {
  const parsed = parseImportedStudyText(JSON.stringify(payload)).data;
  const mapped = mapEntryImportImageReferences(parsed, filename => `saved-${filename}`);
  return normalizeEntry({ ...mapped, id: "text-image-sheet", createdAt: "", updatedAt: "", annotations: [], mastered: false } as WrongAnswerEntry);
}

describe("text import with per-question pictures and shuffled answers", () => {
  it("keeps each picture, body, choices and answer on its question through import and stored reload", () => {
    const entry = normalizeEntry(JSON.parse(JSON.stringify(importEntry(fixture))));
    const session = createExamSession(entry);
    expect(getEntryQuestions(entry)).toHaveLength(3);
    expect(session.questions.map(q => q.questionNumber)).toEqual(["1", "2", "3"]);
    expect(session.sourcePageImages).toEqual([]);
    expect(session.questions.map(q => q.correctAnswer)).toEqual(["②", "①", "③"]);
    expect(session.questions.map(q => q.questionImages)).toEqual([["saved-graph-a.png"], ["saved-triangle-b.png"], []]);
    expect(session.questions.map(q => q.figures.map(f => f.id))).toEqual([["graph-a"], ["triangle-b"], []]);
    expect(session.questions[0].question).toContain("파란 그래프 A");
    expect(session.questions[1].question).toContain("주황 삼각형 B");
    expect(session.questions[2].question).toContain("2+3");
    expect(session.questions[0].choices).toEqual(["① 2", "② 4", "③ 6"]);
    expect(session.questions[1].choices).toEqual(["① 6", "② 7", "③ 12"]);
    expect(session.questions[2].figures).toEqual([]);
    expect(publicExamQuestion(session)?.question.correctAnswer).toBeUndefined();
    const segments = session.questions[0].contentSegments ?? [];
    const picture = segments.findIndex(segment => segment.type === "figure" && segment.figureId === "graph-a");
    expect(picture).toBeGreaterThan(0);
    expect(segments.slice(0, picture).some(segment => segment.type === "text" && segment.text.includes("x=2"))).toBe(false);
    expect(segments.slice(picture + 1).some(segment => segment.type === "text" && segment.text.includes("x=2"))).toBe(true);
  });

  it("scores chosen text answers by question number in both exam modes", () => {
    for (const mode of ["practice", "real"] as const) {
      let session = createExamSession(importEntry(fixture), new Date(), { mode });
      session = updateExamResponse(session, { questionNumber: "2", response: "③", scratchNote: "", markedForReview: false, updatedAt: "" });
      session = updateExamResponse(session, { questionNumber: "1", response: "②", scratchNote: "", markedForReview: false, updatedAt: "" });
      const score = scoreExamSession(session);
      expect(score).toMatchObject({ correctCount: 1, wrongCount: 1, unansweredCount: 1, answeredCount: 2 });
      expect(score.questionResults.map(q => [q.questionNumber, q.correct, q.hasResponse])).toEqual([["1", true, true], ["2", false, true], ["3", false, false]]);
    }
  });

  it("does not guess which of several text questions owns a loose uploaded image", () => {
    const payload = { ...fixture, figures: [], questionImages: ["unassigned.png"] };
    const session = createExamSession(importEntry(payload));
    expect(session.questions.every(q => q.questionImages.length === 0 && q.figures.length === 0)).toBe(true);
  });
});
