import { describe, expect, it } from "vitest";
import { resolveEntryQuestionStimulusProjection, resolveEntryQuestionStimuli } from "./questionStimuli";
import { parseQuestionText } from "./textLayout";
import { getEntryQuestions } from "./entryQuestions";
import { createExamSession } from "../features/exam/services/examSession";
import { wrongAnswerPresentation } from "../features/exam/services/wrongAnswerPresentation";
import { createEmptyEntryDraft } from "../features/entries/model/entryDraft";
import type { WrongAnswerEntry } from "../types";

const body = "1. 첫 문제\n① 1\n② 2\n\n2. 둘째 문제\n① 3\n② 4\n\n3. 독립 문제\n① 5\n② 6";
describe("shared passage scope", () => {
  it.each(["~", "～", "〜", "–", "—", "-"])("keeps the %s range and figure within questions 1–2", separator => {
    const source = { question: `[1${separator}2] 다음 글을 읽으시오.\n공통 조건 [FIGURE:shared]\n\n${body}` };
    const map = resolveEntryQuestionStimuli(source);
    expect([...map.keys()]).toEqual(["1", "2"]);
    expect(map.get("1")?.text).toContain("[FIGURE:shared]");
    expect(map.get("2")?.id).toBe(map.get("1")?.id);
  });
  it("keeps a range followed by [지문] bounded", () => {
    const map = resolveEntryQuestionStimuli({ question: `[1~2]\n[지문]\n공통 조건\n\n${body}` });
    expect([...map.keys()]).toEqual(["1", "2"]);
    expect(map.get("1")?.text).toContain("[1~2]\n[지문]");
  });
  it("preserves an unnamed leading passage", () => {
    expect(resolveEntryQuestionStimuli({ question: `공통 조건은 x=2이다.\n\n${body}` }).get("2")?.text).toBe("공통 조건은 x=2이다.");
  });
  it.each(["[2~1]", "[1~4]", "[1~?]"])("retains %s for review without guessing", heading => {
    const projection = resolveEntryQuestionStimulusProjection({ question: `${heading}\n조건\n\n${body}` });
    expect(projection.stimuli.size).toBe(0);
    expect(projection.warnings.size).toBeGreaterThan(0);
  });
  it("refuses the entire group when a normalized target number is duplicated", () => {
    const projection = resolveEntryQuestionStimulusProjection({ question: `[1~2]\n조건\n\n${body}\n\n01. 다른 1번` });
    expect(projection.stimuli.size).toBe(0);
    expect(projection.warnings.get("2")).toContain("중복 번호");
  });
  it("does not absorb the next range or its text into the preceding choice", () => {
    const text = `1. 독립 문제\n① 1\n② 2\n\n[2~3] 다음 자료\n새 공통 조건\n\n2. 둘째 문제\n① 3\n② 4\n\n3. 셋째 문제`;
    const first = parseQuestionText(text).find(item => item.kind === "question");
    expect(first?.kind === "question" && first.choices[1].text).toBe("2");
    const map = resolveEntryQuestionStimuli({ question: text });
    expect(map.get("1")).toBeUndefined();
    expect(map.get("2")?.text).toContain("새 공통 조건");
    expect(map.get("3")?.id).toBe(map.get("2")?.id);
  });
  it("carries the same bounded passage and figure through canonical snapshots and wrong answers", () => {
    const entry: WrongAnswerEntry = { ...createEmptyEntryDraft("problem_sheet"), id: "sheet", title: "자료", createdAt: "2026-10-15T00:00:00Z", updatedAt: "2026-10-15T00:00:00Z",
      question: `[1~2] 다음 글\n조건 [FIGURE:shared]\n\n${body}`,
      structuredQuestions: [1, 2, 3].map(n => ({ questionNumber: String(n), questionText: ["첫 문제", "둘째 문제", "독립 문제"][n - 1], contentSegments: [], conditions: [], equations: [], choices: [`① ${n * 2 - 1}`, `② ${n * 2}`], figureIds: [] })),
      figures: [{ id: "shared", questionNumber: "", title: "자료", caption: "설명", source: "described_only" }] };
    const original = structuredClone(entry);
    expect(getEntryQuestions(entry).map(q => Boolean(q.passage))).toEqual([true, true, false]);
    const session = createExamSession(entry);
    expect(session.questions.map(q => Boolean(q.passage))).toEqual([true, true, false]);
    expect(session.questions[1].figures[0]?.id).toBe("shared");
    const data = wrongAnswerPresentation(session, session.questions[1]);
    expect(data.questionContentSegments?.["2"][0]).toMatchObject({ type: "text", text: expect.stringContaining("조건 [FIGURE:shared]") });
    expect(entry).toEqual(original);
  });
});
