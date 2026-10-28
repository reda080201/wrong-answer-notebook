import { describe, expect, it } from "vitest";
import type { EntryFormData } from "../../../types";
import { applyNewStudyAssessments, preserveAssessmentEdits } from "./preserveAssessmentEdits";
import type { QuestionMeta } from "../../../types";
import { parseVisionAnalysis } from "./visionSchema";
import cases from "../../../../tools/diagram_pipeline/tests/fixtures/vision-v2-cases.json";

describe("preserveAssessmentEdits", () => {
  it("does not copy content or staged image references from the previous result", () => {
    const analysis = parseVisionAnalysis(cases.find(row => row.valid)!.text);
    const job = { version: 1 as const, id: "job", analysisText: JSON.stringify(analysis), sourceFiles: [{ sourceKey: analysis.sources[0].sourceKey, name: "source.pdf", sha256: "a".repeat(64) }] };
    const previous: Partial<EntryFormData> = {
      question: "사용자 수정 문제 본문", myAnswer: "사용자 풀이", correctAnswer: "사용자 답",
      explanationParts: [{ id: "explain", text: "설명", images: [] }],
      answerKey: [{ id: "answer", questionNumber: "1", answer: "수정 답", explanation: "설명", importantPoints: [] }],
      figures: [{ id: "card", questionNumber: "1", title: "수정 카드", caption: "", source: "original" }],
      learningBlocks: [{ id: "draft-card", type: "concept", content: "개념", title: "학습 카드" }],
      questionImages: ["old-session-image"],
      questionMeta: [{ questionNumber: analysis.entries[0].questions[0].questionNumber!, important: false, note: "직접 기록", updatedAt: "now" }],
    };
    const next: Partial<EntryFormData> = {
      question: "새 분석 본문", myAnswer: "새 풀이", correctAnswer: "새 답",
      explanationParts: [], answerKey: [], figures: [], learningBlocks: [],
      questionImages: ["new-session-image"], questionMeta: [],
    };

    const result = preserveAssessmentEdits(previous, next, job, job);
    expect(result).toMatchObject({ question: "새 분석 본문", myAnswer: "새 풀이", correctAnswer: "새 답", questionImages: ["new-session-image"] });
  });

  it("does not preserve any prior draft when question keys or source bindings change", () => {
    const analysis = parseVisionAnalysis(cases.find(row => row.valid)!.text);
    const job = { version: 1 as const, id: "job", analysisText: JSON.stringify(analysis), sourceFiles: [{ sourceKey: analysis.sources[0].sourceKey, name: "source.pdf", sha256: "a".repeat(64) }] };
    const changed = structuredClone(analysis);
    const question = changed.entries[0].questions[0];
    const oldKey = question.questionKey; question.questionKey += "-changed";
    changed.figures.filter(figure => figure.entryKey === changed.entries[0].entryKey && figure.questionKey === oldKey).forEach(figure => { figure.questionKey = question.questionKey; });
    const nextJob = { ...job, analysisText: JSON.stringify(changed) };
    const previous: Partial<EntryFormData> = { question: "edited", questionMeta: [] };
    const next: Partial<EntryFormData> = { question: "fresh", questionMeta: [] };
    expect(preserveAssessmentEdits(previous, next, job, nextJob)).toBe(next);
  });

  it("replaces old assessment evidence with new evidence or removes it when absent", () => {
    const oldMeta = { questionNumber: "1", important: false, note: "수정 메모", assessmentEvidence: { provider: "openai", responseHashes: ["old"] }, studyAssessment: { summary: "old" } } as unknown as QuestionMeta;
    const withoutEvidence = { questionNumber: "1", studyAssessment: { summary: "new" } } as unknown as QuestionMeta;
    const removed = applyNewStudyAssessments({ question: "kept", questionMeta: [oldMeta] }, { question: "discarded", questionMeta: [withoutEvidence] });
    expect(removed.question).toBe("kept");
    expect(removed.questionMeta?.[0]).toMatchObject({ important: false, note: "수정 메모", studyAssessment: { summary: "new" } });
    expect(removed.questionMeta?.[0]).not.toHaveProperty("assessmentEvidence");

    const withEvidence: QuestionMeta = { ...withoutEvidence, assessmentEvidence: { provider: "openai", model: "gpt-fixture", responseHashes: ["new"], requestIds: ["request"], sourceHashes: ["hash"], completedAt: "now", independent: false } };
    const replaced = applyNewStudyAssessments({ questionMeta: [oldMeta] }, { questionMeta: [withEvidence] });
    expect(replaced.questionMeta?.[0].assessmentEvidence).toEqual(withEvidence.assessmentEvidence);
  });
});
