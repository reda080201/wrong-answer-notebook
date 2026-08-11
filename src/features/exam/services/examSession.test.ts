import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../../../types";
import { createExamSession, publicExamQuestion, updateExamResponse } from "./examSession";
import { normalizeExamAnswer, scoreExamSession } from "./examScoring";

const entry = {
  id: "sheet-1", subject: "수학", title: "모의고사", question: "1. 함수의 값은?\n① 1\n② 2", questionImages: [], entryKind: "problem_sheet", difficult: false, myAnswer: "", correctAnswer: "", explanationParts: [], memo: "", annotations: [], tags: [], answerKey: [{ id: "a1", questionNumber: "1", answer: "②", explanation: "해설", importantPoints: [] }], figures: [], mastered: false, createdAt: "", updatedAt: "",
} as WrongAnswerEntry;

describe("exam session foundation", () => {
  it("creates a snapshot that hides answers in public question payloads", () => {
    const session = createExamSession(entry);
    const payload = publicExamQuestion(session);
    expect(payload?.question.correctAnswer).toBeUndefined();
    expect(payload?.question.explanation).toBeUndefined();
    expect(payload?.answerAvailable).toBe(false);
  });

  it("scores submitted responses", () => {
    const session = updateExamResponse(createExamSession(entry), { questionNumber: "1", response: "②", scratchNote: "", markedForReview: false, updatedAt: "" });
    const score = scoreExamSession(session);
    expect(score.correctCount).toBe(1);
  });

  it("matches answer keys and figures using normalized question numbers", () => {
    const normalizedEntry = {
      ...entry,
      question: "10. 함수의 값은?\n① 1\n② 2",
      sourcePageImages: ["problem.png"],
      figures: [{ id: "f1", questionNumber: "10번", title: "도표", caption: "", image: "figure.png", source: "original", needsReview: false }],
      answerKey: [{ id: "a10", questionNumber: "10.", answer: "②", explanation: "해설", importantPoints: [] }],
    } as WrongAnswerEntry;
    const session = createExamSession(normalizedEntry);
    expect(session.questions[0]?.correctAnswer).toBe("②");
    expect(session.questions[0]?.figures).toHaveLength(1);
    expect(session.questions[0]?.questionImages).toEqual([]);
    expect(session.questions[0]?.sourcePageImages).toEqual(["problem.png"]);
  });

  it("projects structured question semantics into a detached exam snapshot", () => {
    const structuredEntry = {
      ...entry,
      question: "호환용 본문",
      structuredQuestions: [{
        questionNumber: "03",
        section: "수학 II",
        questionType: "multiple_choice",
        points: 4,
        questionText: "정답을 고르시오.",
        conditions: ["x > 0"],
        equations: ["x = 1"],
        choices: [],
        contentSegments: [{ id: "text-1", type: "text", text: "정답을 고르시오." }],
        source: { title: "기출", page: 2, reference: "p. 2" },
        needsReview: false,
        warning: "원본 확인 필요",
        figureIds: ["figure-1"],
      }],
    } as WrongAnswerEntry;

    const session = createExamSession(structuredEntry);
    const snapshot = session.questions[0];
    expect(snapshot).toMatchObject({
      questionNumber: "3",
      section: "수학 II",
      questionType: "multiple_choice",
      question: "정답을 고르시오.",
      conditions: ["x > 0"],
      equations: ["x = 1"],
      choices: [],
      needsReview: true,
      warning: expect.stringContaining("선택지가 없어"),
      sourceWarning: expect.stringContaining("선택지가 없어"),
      points: 4,
      figureIds: ["figure-1"],
      source: { title: "기출", page: 2, reference: "p. 2" },
    });
    expect(snapshot?.contentSegments).toEqual([
      { id: "text-1", type: "text", text: "정답을 고르시오." },
      { id: "condition-1", type: "condition", text: "x > 0" },
      { id: "equation-1", type: "equation", latex: "x = 1", display: true },
    ]);

    structuredEntry.structuredQuestions![0].conditions.push("changed");
    structuredEntry.structuredQuestions![0].contentSegments[0] = { id: "changed", type: "text", text: "changed" };
    expect(snapshot?.conditions).toEqual(["x > 0"]);
    expect(snapshot?.contentSegments?.[0]).toEqual({ id: "text-1", type: "text", text: "정답을 고르시오." });
  });

  it("normalizes common objective and numeric answer forms before scoring", () => {
    expect(normalizeExamAnswer("③")).toBe("3");
    expect(normalizeExamAnswer("3번")).toBe("3");
    expect(normalizeExamAnswer("024")).toBe("24");
    expect(normalizeExamAnswer("1, 3")).toBe("1,3");
    expect(normalizeExamAnswer("3,1")).toBe("1,3");
  });

  it("keeps a shared passage in every question snapshot", () => {
    const withPassage = {
      ...entry,
      question: "[자료]\n함수 f(x)의 성질을 이용한다.\n\n1. 첫 문제\n① 1\n② 2\n\n2. 둘째 문제\n① 3\n② 4",
    } as WrongAnswerEntry;
    const session = createExamSession(withPassage);
    expect(session.questions).toHaveLength(2);
    expect(session.questions[0]?.passage).toContain("함수 f(x)");
    expect(session.questions[1]?.passage).toContain("함수 f(x)");
  });

  it("assigns the latest stimulus to each question group", () => {
    const withMultipleStimuli = {
      ...entry,
      question: "[자료 A]\nA 자료\n\n1. 첫 문제\n① 1\n② 2\n\n2. 둘째 문제\n① 3\n② 4\n\n[자료 B]\nB 자료\n\n3. 셋째 문제\n① 5\n② 6\n\n4. 넷째 문제\n① 7\n② 8",
    } as WrongAnswerEntry;
    const session = createExamSession(withMultipleStimuli);
    expect(session.questions.map((item) => item.passage)).toEqual([
      "[자료 A]\nA 자료",
      "[자료 A]\nA 자료",
      "[자료 B]\nB 자료",
      "[자료 B]\nB 자료",
    ]);
    expect(session.questions[1]?.question).not.toContain("자료 B");
  });
});

describe("exam snapshot stimulus handling", () => {
  it("ignores inline 자료:, 그림:, and 표: lines inside a question body", () => {
    const withInlineMarkers = {
      ...entry,
      question: "[자료 A]\n공통 지문\n\n1. 첫 문제\n자료: 위 지문을 참고하라.\n그림: 아래 그림을 보라.\n표: 다음 표를 보라.\n① 1\n② 2\n\n2. 둘째 문제\n① 3\n② 4",
    } as WrongAnswerEntry;
    const session = createExamSession(withInlineMarkers);
    expect(session.questions).toHaveLength(2);
    expect(session.questions[0]?.passage).toBe("[자료 A]\n공통 지문");
    expect(session.questions[1]?.passage).toBe("[자료 A]\n공통 지문");
    expect(session.questions[0]?.question).toContain("자료: 위 지문을 참고하라.");
    expect(session.questions[0]?.question).toContain("그림: 아래 그림을 보라.");
    expect(session.questions[0]?.question).toContain("표: 다음 표를 보라.");
  });

  it("treats explicit table markers between questions as the next group passage", () => {
    const withTableMarkers = {
      ...entry,
      question: "[자료 A]\nA 자료\n\n1. 첫 문제\n① 1\n② 2\n\n[표]\n표 내용\n\n2. 둘째 문제\n① 3\n② 4\n\n표:\n다른 표\n\n3. 셋째 문제\n① 5\n② 6\n\n표 1\n번호 표\n\n4. 넷째 문제\n① 7\n② 8",
    } as WrongAnswerEntry;
    const session = createExamSession(withTableMarkers);
    expect(session.questions.map((item) => item.passage)).toEqual([
      "[자료 A]\nA 자료",
      "[표]\n표 내용",
      "표:\n다른 표",
      "표 1\n번호 표",
    ]);
    expect(session.questions[0]?.question).not.toContain("[표]");
    expect(session.questions[1]?.question).not.toContain("표:");
  });

  it("does not promote a marker that appears before the next question choices end", () => {
    const withPrematureMarker = {
      ...entry,
      question: "1. 첫 문제\n① 1\n② 2\n[자료 B]\nB 자료\n\n2. 둘째 문제\n① 3\n② 4",
    } as WrongAnswerEntry;
    const session = createExamSession(withPrematureMarker);
    expect(session.questions).toHaveLength(2);
    expect(session.questions[0]?.passage).toBeUndefined();
    expect(session.questions[1]?.passage).toBeUndefined();
    expect(session.questions[0]?.question).toContain("[자료 B]");
  });

  it("accepts a between-question marker after choices when no choices exist", () => {
    const subjectiveEntry = {
      ...entry,
      question: "1. 서술형 문제\n답을 쓰시오.\n\n[자료 B]\nB 자료\n\n2. 다음 문제\n답을 쓰시오.",
      answerKey: [
        { id: "a1", questionNumber: "1", answer: "①", explanation: "", importantPoints: [] },
        { id: "a2", questionNumber: "2", answer: "②", explanation: "", importantPoints: [] },
      ],
    } as WrongAnswerEntry;
    const session = createExamSession(subjectiveEntry);
    expect(session.questions[0]?.passage).toBeUndefined();
    expect(session.questions[1]?.passage).toBe("[자료 B]\nB 자료");
  });
});
