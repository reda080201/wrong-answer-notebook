import { describe, expect, it } from "vitest";
import { parseQuestionText, splitMarkdownTableSegments } from "./textLayout";
import { normalizeQuestionNumber } from "./questionMeta";
import parserParityCases from "../fixtures/question-parser-parity.json";

describe("parseQuestionText", () => {
  it("matches the Rust MCP parser fixture after shared number normalization", () => {
    for (const testCase of parserParityCases) {
      const questions = parseQuestionText(testCase.source).filter(
        (block) => block.kind === "question",
      );
      expect(questions.map((block) => normalizeQuestionNumber(block.numberLabel))).toEqual(testCase.numbers);
      expect(questions.map((block) => block.body)).toEqual(testCase.bodies);
    }
  });

  it("detects numbered questions with dot and parenthesis forms", () => {
    const blocks = parseQuestionText("1. 첫 문제\n\n2) 둘째 문제");

    expect(blocks).toMatchObject([
      { kind: "question", numberLabel: "1", body: "첫 문제" },
      { kind: "question", numberLabel: "2", body: "둘째 문제" },
    ]);
  });

  it("detects Korean problem labels and hash labels", () => {
    const blocks = parseQuestionText("문제 1 다음을 고르시오\n#2 이어지는 문제");

    expect(blocks).toMatchObject([
      { kind: "question", numberLabel: "1", body: "다음을 고르시오" },
      { kind: "question", numberLabel: "#2", body: "이어지는 문제" },
    ]);
  });

  it("splits passage, questions, and choice markers", () => {
    const text = [
      "다음 글을 읽고 물음에 답하시오.",
      "긴 지문입니다.",
      "1. 글의 주제로 알맞은 것은?",
      "① 주장",
      "② 근거",
      "2. 빈칸에 들어갈 말은?",
      "(1) 첫째",
      "ㄱ. 둘째",
    ].join("\n");

    const blocks = parseQuestionText(text);

    expect(blocks[0]).toMatchObject({
      kind: "passage",
      text: "다음 글을 읽고 물음에 답하시오.\n긴 지문입니다.",
    });
    expect(blocks[1]).toMatchObject({
      kind: "question",
      numberLabel: "1",
      body: "글의 주제로 알맞은 것은?",
      choices: [
        { marker: "①", text: "주장" },
        { marker: "②", text: "근거" },
      ],
    });
    expect(blocks[2]).toMatchObject({
      kind: "question",
      numberLabel: "2",
      body: "빈칸에 들어갈 말은?",
      choices: [
        { marker: "(1)", text: "첫째" },
        { marker: "ㄱ.", text: "둘째" },
      ],
    });
  });

  it("falls back to a paragraph for free text", () => {
    const text = "번호 없는 자유 형식 문제입니다.\n줄바꿈은 보존됩니다.";
    const blocks = parseQuestionText(text);

    expect(blocks).toEqual([
      {
        kind: "paragraph",
        start: 0,
        end: text.length,
        text,
      },
    ]);
  });

  it("uses sequential display numbers even when source numbers are random", () => {
    const blocks = parseQuestionText("0. [표 확인 필요]\n31. 첫 문제\n① 보기\n\n99. 둘째 문제");

    expect(blocks).toMatchObject([
      { kind: "passage", text: "0. [표 확인 필요]" },
      { kind: "question", numberLabel: "31", displayNumber: 1 },
      { kind: "question", numberLabel: "99", displayNumber: 2 },
    ]);
  });

  it("does not split inline choice-like numbers into new questions", () => {
    const blocks = parseQuestionText("1. 첫 문제\n1) 보기 하나\n2) 보기 둘\n\n2) 둘째 문제");
    const questions = blocks.filter((block) => block.kind === "question");

    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({
      displayNumber: 1,
      choices: [
        { marker: "1)", text: "보기 하나" },
        { marker: "2)", text: "보기 둘" },
      ],
    });
    expect(questions[1]).toMatchObject({ displayNumber: 2, body: "둘째 문제" });
  });

  it("detects all twenty questions even when number labels have no spaces", () => {
    const text = Array.from({ length: 20 }, (_, index) => {
      const number = index + 1;
      return `${number}.문제 ${number}\n① 보기`;
    }).join("\n\n");
    const questions = parseQuestionText(text).filter((block) => block.kind === "question");

    expect(questions).toHaveLength(20);
    expect(questions[19]).toMatchObject({
      numberLabel: "20",
      displayNumber: 20,
      body: "문제 20",
    });
  });

  it("detects two digit and bracketed problem labels without confusing choices", () => {
    const text = [
      "10. 열 번째 문제",
      "① 첫 번째 선택지",
      "② 두 번째 선택지",
      "",
      "10번 다른 원문 형식 문제",
      "① 선택지",
      "",
      "[문제 12] 대괄호 문제",
      "① 선택지",
      "",
      "문제 14 연속성 문제",
      "① 선택지",
    ].join("\n");

    const questions = parseQuestionText(text).filter((block) => block.kind === "question");

    expect(questions).toHaveLength(4);
    expect(questions).toMatchObject([
      { numberLabel: "10", body: "열 번째 문제" },
      { numberLabel: "10", body: "다른 원문 형식 문제" },
      { numberLabel: "12", body: "대괄호 문제" },
      { numberLabel: "14", body: "연속성 문제" },
    ]);
    expect(questions[0].choices).toMatchObject([
      { marker: "①", text: "첫 번째 선택지" },
      { marker: "②", text: "두 번째 선택지" },
    ]);
  });

  it("splits Korean condition labels into condition body segments", () => {
    const [block] = parseQuestionText("1. 다음 조건을 만족한다.\n(가) $x>0$\n(나) y는 정수\n① 참\n② 거짓");

    expect(block).toMatchObject({
      kind: "question",
      choices: [
        { marker: "①", text: "참" },
        { marker: "②", text: "거짓" },
      ],
    });
    if (block.kind !== "question") throw new Error("expected question block");
    expect(block.bodySegments).toEqual([
      expect.objectContaining({ kind: "body", text: "다음 조건을 만족한다." }),
      expect.objectContaining({ kind: "condition", text: "(가) $x>0$\n(나) y는 정수", label: "(가)" }),
    ]);
  });

  it("keeps view marker and ㄱㄴㄷ items in view instead of choices", () => {
    const [block] = parseQuestionText("1. 옳은 것을 고르시오.\n<보기>\nㄱ. A는 참\nㄴ. B는 거짓\n① ㄱ\n② ㄱ, ㄴ");

    if (block.kind !== "question") throw new Error("expected question block");
    expect(block.bodySegments).toEqual([
      expect.objectContaining({ kind: "body", text: "옳은 것을 고르시오." }),
      expect.objectContaining({ kind: "view", text: "<보기>\nㄱ. A는 참\nㄴ. B는 거짓", label: "<보기>" }),
    ]);
    expect(block.choices).toEqual([
      expect.objectContaining({ marker: "①", text: "ㄱ" }),
      expect.objectContaining({ marker: "②", text: "ㄱ, ㄴ" }),
    ]);
  });

  it("detects markdown tables as table segments", () => {
    const segments = splitMarkdownTableSegments("자료\n| 구분 | 값 |\n| --- | --- |\n| A | 10 |\n끝");

    expect(segments).toEqual([
      "자료",
      { kind: "table", rows: [["구분", "값"], ["A", "10"]] },
      "끝",
    ]);
  });
});
