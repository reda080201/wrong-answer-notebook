import { describe, expect, it } from "vitest";
import { buildQuestionExportPackage } from "./questionExport";

describe("question export", () => {
  it("keeps structure and excludes answer-like data from the default package", () => {
    const result = buildQuestionExportPackage({ title: "세트", subject: "수학", questions: [{ position: 1, displayQuestionNumber: "1", question: "본문", choices: ["① 선택"], contentSegments: [{ id: "s1", type: "text", text: "본문" }], figures: [{ id: "f1", caption: "그래프", source: "described_only" }] }] });
    expect(result.manifest).toMatchObject({ exportType: "questions_only", includesAnswers: false, includesExplanations: false });
    expect(result.questions[0].contentSegments).toHaveLength(1);
    expect(result.questions[0].figures[0].image).toBeUndefined();
    expect(result.markdown).not.toContain("정답");
  });

  it("removes source references when requested", () => {
    const result = buildQuestionExportPackage({ title: "세트", subject: "수학", questions: [{ position: 1, displayQuestionNumber: "1", question: "본문", choices: [], source: { sourceEntryId: "e1", sourceEntryTitle: "원본", sourceQuestionNumber: "13" }, figures: [] }], options: { includeSourceReferences: false } });
    expect(result.questions[0].source).toBeUndefined();
    expect(result.markdown).not.toContain("원본");
  });
});
