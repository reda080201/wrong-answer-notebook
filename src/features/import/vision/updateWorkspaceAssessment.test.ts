import { describe, expect, it } from "vitest";
import cases from "../../../../tools/diagram_pipeline/tests/fixtures/vision-v2-cases.json";
import type { ImportDraftGroup, ImportQuestionDraft, ImportWorkspace } from "../../import-workspace/model/importWorkspace";
import { bindWorkspaceVision, updateWorkspaceAssessment } from "./updateWorkspaceAssessment";
import { parseVisionAnalysis, type VisionAnalysis } from "./visionSchema";
import { renameQuestionNumber } from "../../import-workspace/services/renameQuestionNumber";

function makeAnalysis(): VisionAnalysis {
  const base = parseVisionAnalysis(cases.find(row => row.valid)!.text);
  const a = structuredClone(base.entries[0]);
  const b = structuredClone(base.entries[0]);
  a.entryKey = "exam-a";
  a.title = "원래 A";
  a.questions[0].questionKey = "q-a-1";
  a.questions[0].studyAssessment!.solution.summary = "새 평가 A";
  a.questions[0].studyAssessment!.scores.difficulty.value = 31;
  a.questions[0].studyAssessment!.learning.candidates = [
    { type: "concept", title: "핵심", content: "공통  개념" },
    { type: "concept", title: "같은 내용", content: "공통 개념" },
  ];
  b.entryKey = "exam-b";
  b.title = "원래 B";
  b.questions[0].questionKey = "q-b-1";
  b.questions[0].source.sourceKey = "upload-2";
  b.questions[0].studyAssessment!.sourceAnswer.sourceKey = "upload-2";
  b.questions[0].studyAssessment!.solution.summary = "새 평가 B";
  b.questions[0].studyAssessment!.scores.difficulty.value = 91;
  const figureA = structuredClone(base.figures[0]);
  figureA.entryKey = a.entryKey;
  figureA.questionKey = a.questions[0].questionKey;
  const figureB = structuredClone(base.figures[0]);
  figureB.entryKey = b.entryKey;
  figureB.questionKey = b.questions[0].questionKey;
  figureB.figureKey = "fig-line-b";
  b.questions[0].figureKeys = [figureB.figureKey];
  b.questions[0].contentSegments.find(segment => segment.type === "figure")!.figureKey = figureB.figureKey;
  return { ...base, sources: [...base.sources, { sourceKey: "upload-2", pageCount: 1 }], entries: [a, b], figures: [figureA, figureB] };
}

function draft(entryKey: string, questionKey: string): ImportDraftGroup {
  const question: ImportQuestionDraft = {
    visionQuestionKey: questionKey, id: `draft-${questionKey}`, groupId: `group-${entryKey}`, order: 0,
    displayQuestionNumber: "1", sourceQuestionNumber: "1", contentSegments: [{ id: "body", type: "text", text: "수정한 본문" }],
    choices: [{ id: "choice", marker: "①", content: "수정한 선택지" }], figures: [{ id: `asset-${questionKey}`, questionNumber: "1", image: "figure.png", title: "그림", caption: "", source: "original", needsReview: true, processingStatus: "needs_review" }],
    questionImageAssets: [`question-${questionKey}.png`], sourcePageAssets: [`source-${entryKey}.png`],
    answer: { id: `answer-${questionKey}`, questionNumber: "1", answer: "③", explanation: "수정한 풀이", confirmed: true },
    explanationParts: [{ id: `explanation-${questionKey}`, text: "수정한 답안 풀이", images: [] }],
    sourceReferences: [{ page: 1, note: "기존 참조" }], status: "ready", warnings: [], sourceText: "수정한 원문",
  };
  return {
    visionEntryKey: entryKey, id: `group-${entryKey}`, title: `편집된 ${entryKey}`, subject: "수학",
    questions: [question], answerItems: [], sourceFileIds: [], userConfirmed: true,
    entryMetadata: {
      memo: `memo-${entryKey}`, myAnswer: "①", correctAnswer: "②", difficult: true,
      questionMeta: [{ questionNumber: "1", important: false, difficultyScore: 44, note: "내 메모", review: { intervalDays: 4, streak: 2, history: [], dueAt: "2026-11-01", lastReviewedAt: "2026-10-01" }, mistakeAnalysis: { causes: [{ type: "careless", severity: "low", note: "직접 기록" }] }, classification: { unit: "수동 단원", concepts: ["내 개념"], answerType: "multiple_choice", difficultySource: "manual" }, rating: { importanceScore: 23, qualityScore: 37, userQualityScore: 39, aiQualityScore: 42, evaluationSource: "manual" }, updatedAt: "old" }],
      learningBlocks: [{ id: "existing-block", type: "concept", title: "기존 학습", content: "유지", reviewStatus: "draft" }],
    },
  };
}

function workspace(analysis: VisionAnalysis): ImportWorkspace {
  const analysisText = JSON.stringify(analysis);
  return {
    id: "workspace", createdAt: "old", updatedAt: "old", status: "ready", sourceFiles: [], assets: [],
    groups: [draft("exam-a", "q-a-1"), draft("exam-b", "q-b-1")], unassignedBlocks: [], excludedBlocks: [], warnings: [], revision: 1,
    visionJob: { version: 1, id: "job", analysisText, sourceFiles: analysis.sources.map(source => ({ sourceKey: source.sourceKey, name: `${source.sourceKey}.pdf`, sha256: "a".repeat(64) })), assessmentEvidence: { independent: false, stages: [] } },
  };
}

describe("workspace vision assessment refresh", () => {
  it("binds same-number documents by stable keys, then updates after reorder and rename without losing user work", () => {
    const original = makeAnalysis();
    const initial = workspace(original);
    const bound = bindWorkspaceVision(initial);
    bound.groups[0] = renameQuestionNumber(bound.groups[0], bound.groups[0].questions[0].id, "7");
    bound.groups[0].excludedLearningBlockIds = ["existing-block"];
    expect(bound.groups.map(group => [group.visionEntryKey, group.questions[0].visionQuestionKey])).toEqual([["exam-a", "q-a-1"], ["exam-b", "q-b-1"]]);

    const reordered = { ...bound, groups: bound.groups.map(group => ({ ...group, title: `renamed ${group.visionEntryKey}` })).reverse() };
    const next = structuredClone(original);
    next.entries[0].title = "새 A 제목";
    next.entries[1].title = "새 B 제목";
    const updated = updateWorkspaceAssessment(reordered, JSON.stringify(next));
    expect(updated.groups.map(group => group.visionEntryKey)).toEqual(["exam-b", "exam-a"]);
    expect(updated.groups.map(group => group.entryMetadata!.questionMeta![0].studyAssessment!.solution.summary)).toEqual(["새 평가 B", "새 평가 A"]);
    for (const group of updated.groups) {
      const meta = group.entryMetadata!.questionMeta![0];
      expect(meta).toMatchObject({ important: false, difficultyScore: 44, note: "내 메모", review: { intervalDays: 4 }, mistakeAnalysis: { causes: [{type: "careless"}] }, classification: { unit: "수동 단원", difficultySource: "manual" }, rating: { importanceScore: 23, qualityScore: 37, userQualityScore: 39, aiQualityScore: 42, evaluationSource: "manual" } });
      expect(group.entryMetadata).toMatchObject({ memo: `memo-${group.visionEntryKey}`, myAnswer: "①", correctAnswer: "②", difficult: true });
      expect(group.questions[0]).toMatchObject({ sourceText: "수정한 원문", answer: { answer: "③" }, contentSegments: [{ text: "수정한 본문" }], questionImageAssets: [`question-${group.questions[0].visionQuestionKey}.png`], sourcePageAssets: [`source-${group.visionEntryKey}.png`] });
      expect(group.questions[0].figures[0].image).toBe("figure.png");
      expect(group.questions[0].explanationParts[0].text).toBe("수정한 답안 풀이");
    }
    const byKey = Object.fromEntries(updated.groups.map(group => [group.visionEntryKey, group]));
    expect(byKey["exam-a"].entryMetadata!.learningBlocks).toHaveLength(2); // existing plus one normalized/deduped candidate
    expect(byKey["exam-a"].entryMetadata!.questionMeta![0].questionNumber).toBe("7");
    expect(byKey["exam-a"].entryMetadata!.learningBlocks!.at(-1)!.sourceQuestionNumber).toBe("7");
    expect(byKey["exam-a"].excludedLearningBlockIds).toEqual(["existing-block"]);
    expect(updateWorkspaceAssessment(updated, JSON.stringify(next)).groups[1].entryMetadata!.learningBlocks).toHaveLength(2);
    expect(byKey["exam-a"].entryMetadata!.learningBlocks!.filter(block => block.content === "공통  개념" || block.content === "공통 개념")).toHaveLength(1);
    expect(updated.visionJob!.assessmentEvidence).toBeUndefined();
    expect(updated.visionJob!.analysisText).toBe(JSON.stringify(next));
  });

  it("rejects bad entry/question keys, changed source links, and duplicate draft numbers without mutating input", () => {
    const original = makeAnalysis();
    const text = JSON.stringify(original);
    const bound = bindWorkspaceVision(workspace(original));
    const badEntryKey = structuredClone(bound); badEntryKey.groups[0].visionEntryKey = "no-such-entry";
    const badQuestionKey = structuredClone(bound); badQuestionKey.groups[0].questions[0].visionQuestionKey = "no-such-question";
    const duplicateNumber = structuredClone(bound); duplicateNumber.groups[0].questions.push({ ...duplicateNumber.groups[0].questions[0], id: "duplicate", visionQuestionKey: "q-a-1" });
    const changedSource = structuredClone(original); changedSource.entries[0].questions[0].source.sourceKey = "upload-2";
    for (const [candidate, candidateText] of [[badEntryKey, text], [badQuestionKey, text], [duplicateNumber, text], [bound, JSON.stringify(changedSource)]] as const) {
      const before = structuredClone(candidate);
      expect(() => updateWorkspaceAssessment(candidate, candidateText)).toThrow();
      expect(candidate).toEqual(before);
    }
  });
});
