import { describe, expect, it } from "vitest";
import cases from "../../../../tools/diagram_pipeline/tests/fixtures/vision-v2-cases.json";
import { parseVisionAnalysis } from "./visionSchema";
import { mapVisionAssessment } from "./assessmentMapping";
import { normalizeQuestionMeta } from "../../../utils/questionMeta";
import { confirmAssessmentAnswer, isAnswerReadyForGrading, normalizeAnswerProvenance } from "../../../utils/studyAssessment";
import { createExamSession, publicExamQuestion } from "../../exam/services/examSession";
import { wrongAnswerPresentation } from "../../exam/services/wrongAnswerPresentation";
import type { WrongAnswerEntry } from "../../../types";

describe("assessment persistence and grading policy", () => {
  it("preserves official and proposed answers separately and blocks a conflict until explicit confirmation", () => {
    const q = parseVisionAnalysis(cases.find(item => item.valid)!.text).entries[0].questions[0];
    const mapped = mapVisionAssessment(q, "answer-id", "2026-10-27T00:00:00Z");
    expect(mapped.answer?.answer).toBe("①");
    expect(mapped.answer?.answerProvenance?.proposedAnswer).toBe("②");
    expect(isAnswerReadyForGrading(mapped.answer)).toBe(false);
    expect(isAnswerReadyForGrading(confirmAssessmentAnswer(mapped.answer!))).toBe(true);
    expect(normalizeAnswerProvenance(confirmAssessmentAnswer(mapped.answer!).answerProvenance)?.kind).toBe("gpt_estimate");
    expect(normalizeAnswerProvenance(confirmAssessmentAnswer(mapped.answer!).answerProvenance, true)?.kind).toBe("user_confirmed");
  });
  it("roundtrips assessment reasons and scores without upgrading an external GPT claim", () => {
    const q = parseVisionAnalysis(cases.find(item => item.valid)!.text).entries[0].questions[0];
    const { meta } = mapVisionAssessment(q, "a", "2026-10-27T00:00:00Z");
    const restored = normalizeQuestionMeta(JSON.parse(JSON.stringify([meta])))[0];
    expect(restored.difficultyScore).toBe(72);
    expect(restored.rating?.importanceScore).toBe(85);
    expect(restored.rating?.evaluationSource).toBe("imported");
    expect(restored.studyAssessment).toEqual(q.studyAssessment);
    expect(normalizeQuestionMeta([{ ...restored, important: false, rating: { ...restored.rating, qualityScore: 40, userQualityScore: 41, evaluationSource: "manual" } }])[0]).toMatchObject({ important: false, rating: { qualityScore: 40, userQualityScore: 41, evaluationSource: "manual" } });
  });
  it("does not turn malformed provenance into a legacy confirmed answer", () => {
    expect(() => normalizeAnswerProvenance({ kind: "fake" })).toThrow();
  });
  it("keeps scores in saved exam and wrong-answer snapshots while omitting them from public in-progress context", () => {
    const q = parseVisionAnalysis(cases.find(item => item.valid)!.text).entries[0].questions[0];
    const mapped = mapVisionAssessment(q, "a", "2026-10-27T00:00:00Z");
    const entry = { id: "score-sheet", title: "합성", subject: "수학", entryKind: "problem_sheet", question: "1. 합성 문항\n① 1\n② 2", structuredQuestions: [{ questionNumber: "1", questionText: "합성 문항", contentSegments: [{ id: "text", type: "text", text: "합성 문항" }], conditions: [], equations: [], choices: ["① 1", "② 2"], figureIds: [] }], figures: [], questionImages: [], questionMeta: [mapped.meta], answerKey: [mapped.answer] } as unknown as WrongAnswerEntry;
    expect(createExamSession(entry).questions[0].correctAnswer).toBeUndefined();
    entry.answerKey = [confirmAssessmentAnswer(mapped.answer!)];
    const session = createExamSession(entry);
    expect(session.questions[0].correctAnswer).toBe("①");
    expect(session.questions[0].questionMeta?.rating?.importanceScore).toBe(85);
    expect(publicExamQuestion(session)?.question.questionMeta).toBeUndefined();
    expect(wrongAnswerPresentation(session, session.questions[0]).questionMeta?.[0].difficultyScore).toBe(72);
  });
});
