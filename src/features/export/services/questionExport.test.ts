import { describe, expect, it } from "vitest";
import { buildQuestionExportPackage, entryToQuestionExport } from "./questionExport";

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

  it("exports only the requested parsed question with normalized figures and choices", () => {
    const entry = {
      id: "sheet-1", subject: "수학", title: "시험지", question: "[문제 1] 첫 문제\n① 하나\n② 둘\n[문제 02] 둘째 문제\n① 셋",
      entryKind: "problem_sheet", figures: [{ id: "f2", questionNumber: "02번", title: "그래프", caption: "", source: "original" as const, image: "f2.png" }],
      questionContentSegments: { "02": [{ id: "s2", type: "text" as const, text: "둘째 본문" }] },
    } as never;
    const result = entryToQuestionExport(entry, ["2번"]);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]).toMatchObject({ displayQuestionNumber: "02", question: "둘째 문제", choices: ["① 셋"] });
    expect(result.questions[0].question).not.toContain("첫 문제");
    expect(result.questions[0].figures).toHaveLength(1);
    expect(result.questions[0].contentSegments).toEqual([{ id: "s2", type: "text", text: "둘째 본문" }]);
  });

  it("does not export the whole sheet when a problem-sheet number is missing", () => {
    const entry = { id: "sheet-1", subject: "수학", title: "시험지", question: "1. 하나", entryKind: "problem_sheet", figures: [] } as never;
    expect(() => entryToQuestionExport(entry, ["9"])).toThrow("9번 문항을 찾지 못해");
  });
});
