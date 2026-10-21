import { describe, expect, it } from "vitest";
import { createEmptyEntryDraft } from "./entryDraft";
import { editableEntryQuestions, hasAmbiguousEntryQuestionData, hasAmbiguousQuestionIdentity, saveEntryQuestionEdits } from "./questionEditing";
import { updateStructuredQuestionSegment } from "../../import/services/structuredQuestionSegments";
import { getEntryQuestions } from "../../../utils/entryQuestions";

const original = () => ({
  ...createEmptyEntryDraft(), question: "1. 앞 본문\n뒤 본문\nx^2\nx^2\n① 하나\n② 둘",
  structuredQuestions: [{ questionNumber: "1", questionText: "앞 본문\n뒤 본문", choices: ["① 하나", "② 둘"], conditions: [], equations: ["x^2", "x^2"], figureIds: ["g"], source: { page: 2 },
    contentSegments: [
      { id: "before", type: "text" as const, text: "앞 본문" },
      { id: "figure", type: "figure" as const, figureId: "g" },
      { id: "after", type: "text" as const, text: "뒤 본문" },
      { id: "eq1", type: "equation" as const, latex: "x^2", display: true },
      { id: "eq2", type: "equation" as const, latex: "x^2", display: true },
      { id: "table", type: "table" as const, rows: [["표"]] },
    ] }],
});

describe("entry question editing", () => {
  it("saves canonical text, choices, and compatibility together without moving rich segments", () => {
    const data = original();
    const questions = updateStructuredQuestionSegment(editableEntryQuestions(data), { questionNumber: "1", segmentId: "before", value: "수정 본문" });
    questions[0].choices[0] = "① 새 보기";
    const saved = saveEntryQuestionEdits(data, { ...data, structuredQuestions: questions });
    expect(saved.question).toContain("수정 본문");
    expect(saved.question).not.toContain("앞 본문");
    expect(saved.question).toContain("① 새 보기");
    expect(saved.questionContentSegments?.["1"].map(segment => segment.id)).toEqual(["before", "figure", "after", "eq1", "eq2", "table"]);
    expect(saved.structuredQuestions?.[0].equations).toEqual(["x^2", "x^2"]);
    expect(saved.structuredQuestions?.[0].source).toEqual({ page: 2 });
    expect(getEntryQuestions(saved)[0].questionText).toBe("수정 본문\n뒤 본문");
    expect(data.structuredQuestions[0].questionText).toContain("앞 본문");
  });

  it("keeps a legacy-only sentence and shared passage while editing structured prose", () => {
    const data = original();
    data.question = "[1~2] 공통 지문\n공통 자료\n\n" + data.question.replace("앞 본문", "앞 본문\n호환 원문에만 있는 문장");
    const questions = editableEntryQuestions(data);
    expect(questions[0].contentSegments.some(segment => segment.type === "text" && segment.text.includes("호환 원문에만 있는 문장"))).toBe(true);
    const next = updateStructuredQuestionSegment(questions, { questionNumber: "1", segmentId: "before", value: "바꾼 본문" });
    const saved = saveEntryQuestionEdits(data, { ...data, structuredQuestions: next });
    expect(saved.question).toContain("공통 지문");
    expect(saved.question).toContain("호환 원문에만 있는 문장");
  });

  it("supports a generated single snapshot whose printed source number differs", () => {
    const data = { ...original(), generatedFromExamSessionId: "session", generatedFromQuestionNumber: "7" };
    data.structuredQuestions[0].questionNumber = "7";
    const questions = updateStructuredQuestionSegment(editableEntryQuestions(data), { questionNumber: "7", segmentId: "before", value: "생성 문항 수정" });
    const saved = saveEntryQuestionEdits(data, { ...data, structuredQuestions: questions });
    expect(saved.question).toContain("1. 생성 문항 수정");
    expect(saved.structuredQuestions?.[0].questionNumber).toBe("7");
    expect(saved.questionContentSegments?.["7"]?.[0]).toMatchObject({ id: "before", text: "생성 문항 수정" });
  });

  it("edits segments-only generated data without losing its figure or identity", () => {
    const data = { ...createEmptyEntryDraft(), question: "앞 본문 뒤 본문", generatedFromExamSessionId: "session", generatedFromQuestionNumber: "7", questionContentSegments: { "7": original().structuredQuestions[0].contentSegments } };
    const questions = updateStructuredQuestionSegment(editableEntryQuestions(data), { questionNumber: "7", segmentId: "before", value: "변경" });
    const saved = saveEntryQuestionEdits(data, { ...data, structuredQuestions: questions });
    expect(saved.question).toBe("변경 뒤 본문");
    expect(saved.questionContentSegments?.["7"].map(segment => segment.id)).toContain("figure");
  });

  it("supports a single stored source-number alias while keeping the generated identity", () => {
    const data = { ...createEmptyEntryDraft(), question: "1. 앞 본문 뒤 본문", generatedFromExamSessionId: "session", generatedFromQuestionNumber: "7", questionContentSegments: { "1": original().structuredQuestions[0].contentSegments } };
    const next = updateStructuredQuestionSegment(editableEntryQuestions(data), { questionNumber: "7", segmentId: "before", value: "변경" });
    const saved = saveEntryQuestionEdits(data, { ...data, structuredQuestions: next });
    expect(saved.question).toBe("1. 변경 뒤 본문");
    expect(saved.structuredQuestions?.[0].questionNumber).toBe("7");
    expect(saved.questionContentSegments?.["7"][0]).toMatchObject({ id: "before", text: "변경" });
  });

  it("keeps ambiguous generated segment maps intact and blocks body editing", () => {
    const data = { ...createEmptyEntryDraft(), question: "1. 원문", generatedFromExamSessionId: "session", generatedFromQuestionNumber: "7", questionContentSegments: { "1": original().structuredQuestions[0].contentSegments, "2": original().structuredQuestions[0].contentSegments } };
    expect(hasAmbiguousEntryQuestionData(data)).toBe(true);
    expect(editableEntryQuestions(data)).toEqual([]);
    expect(saveEntryQuestionEdits(data, { ...data, title: "제목 수정" }).questionContentSegments).toEqual(data.questionContentSegments);
    expect(() => saveEntryQuestionEdits(data, { ...data, question: "새 본문" })).toThrow("연결이 모호");
    expect(hasAmbiguousEntryQuestionData({ ...data, generatedFromQuestionNumber: undefined })).toBe(true);
    expect(editableEntryQuestions({ ...data, generatedFromQuestionNumber: undefined })).toEqual([]);
  });

  it("moves exact legacy and canonical annotations, preserving image annotations", () => {
    const data = { ...original(), annotations: [
      { id: "legacy", target: "question" as const, kind: "text" as const, start: 8, end: 12, tool: "highlight" as const },
      { id: "canonical", target: "question" as const, kind: "text" as const, start: 0, end: 0, tool: "highlight" as const, canonicalQuestionKey: '["1",""]', canonicalAnchors: [{ segmentId: "before", start: 2, end: 4 }] },
      { id: "image", target: "question" as const, kind: "image" as const, imageId: "img.png", x: 0, y: 0, width: .1, height: .1, tool: "highlight" as const },
    ] };
    const questions = updateStructuredQuestionSegment(editableEntryQuestions(data), { questionNumber: "1", segmentId: "before", value: "새 앞 본문" });
    const saved = saveEntryQuestionEdits(data, { ...data, structuredQuestions: questions });
    expect(saved.annotations?.[0]).toMatchObject({ start: 10, end: 14 });
    expect(saved.annotations?.[1]).toMatchObject({ canonicalAnchors: [{ segmentId: "before", start: 4, end: 6 }] });
    expect(saved.annotations?.[2]).toEqual(data.annotations[2]);
  });

  it("blocks ambiguous edits instead of discarding annotations or choosing the first duplicate", () => {
    const data = { ...original(), annotations: [{ id: "old", target: "question" as const, kind: "text" as const, start: 3, end: 7, tool: "underline" as const }] };
    const questions = updateStructuredQuestionSegment(editableEntryQuestions(data), { questionNumber: "1", segmentId: "before", value: "모두 변경" });
    expect(() => saveEntryQuestionEdits(data, { ...data, structuredQuestions: questions })).toThrow("필기");
    expect(hasAmbiguousQuestionIdentity([questions[0], { ...questions[0], questionNumber: "01번" }])).toBe(true);
    const duplicate = { ...data, structuredQuestions: [data.structuredQuestions[0], { ...data.structuredQuestions[0], questionNumber: "01번" }] };
    expect(() => saveEntryQuestionEdits(duplicate, { ...duplicate, structuredQuestions: questions })).toThrow("연결이 모호");
    expect(editableEntryQuestions(duplicate).map(question => question.questionNumber)).toEqual(["1", "01번"]);
  });

  it("keeps normalized segment keys and consumes only represented figure tokens", () => {
    const data = { ...createEmptyEntryDraft(), question: "1. 앞 본문\n[FIGURE:g]\n뒤 본문", questionContentSegments: { "01번": original().structuredQuestions[0].contentSegments } };
    const questions = editableEntryQuestions(data);
    expect(questions[0].questionNumber).toBe("01번");
    expect(questions[0].contentSegments.filter(segment => segment.type === "figure")).toHaveLength(1);
    expect(questions[0].contentSegments.some(segment => segment.type === "text" && segment.text.includes("[FIGURE:g]"))).toBe(false);
    const next = updateStructuredQuestionSegment(questions, { questionNumber: "01번", segmentId: "before", value: "수정" });
    const saved = saveEntryQuestionEdits(data, { ...data, structuredQuestions: next });
    expect(saved.question).toContain("[FIGURE:g]");
    expect(saved.questionContentSegments?.["01번"]?.[0]).toMatchObject({ text: "수정" });
  });

  it("can reduce and extend choices while keeping compatibility counts and a following passage", () => {
    const data = original();
    data.question += "\n\n[2~3] 다음 공통 지문\n다음 자료";
    const questions = editableEntryQuestions(data);
    questions[0].choices = ["① 새 보기"];
    const reduced = saveEntryQuestionEdits(data, { ...data, structuredQuestions: questions });
    expect(reduced.question).not.toContain("② 둘");
    expect(getEntryQuestions(reduced)[0].choices).toEqual(["① 새 보기"]);
    questions[0].choices.push("② 추가 보기", "③ 그림 [FIGURE:g]");
    const extended = saveEntryQuestionEdits(data, { ...data, structuredQuestions: questions });
    expect(extended.question).toContain("③ 그림 [FIGURE:g]");
    expect(extended.question.indexOf("③ 그림")).toBeLessThan(extended.question.indexOf("[2~3]"));
    expect(extended.question).toContain("다음 공통 지문");
  });

  it("refuses to silently drop unmatched or ambiguous stored segment maps", () => {
    const data = { ...original(), questionContentSegments: { "1": original().structuredQuestions[0].contentSegments, "01번": original().structuredQuestions[0].contentSegments } };
    const questions = updateStructuredQuestionSegment(editableEntryQuestions(data), { questionNumber: "1", segmentId: "before", value: "수정" });
    expect(() => saveEntryQuestionEdits(data, { ...data, structuredQuestions: questions })).toThrow("연결이 모호");
    const unmatched = { ...data, questionContentSegments: { "99": original().structuredQuestions[0].contentSegments } };
    expect(() => saveEntryQuestionEdits(unmatched, { ...unmatched, structuredQuestions: questions })).toThrow("연결이 모호");
  });
});
