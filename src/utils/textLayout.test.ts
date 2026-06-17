import { describe, expect, it } from "vitest";
import { parseQuestionText, splitMarkdownTableSegments } from "./textLayout";

describe("parseQuestionText", () => {
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

  it("detects markdown tables as table segments", () => {
    const segments = splitMarkdownTableSegments("자료\n| 구분 | 값 |\n| --- | --- |\n| A | 10 |\n끝");

    expect(segments).toEqual([
      "자료",
      { kind: "table", rows: [["구분", "값"], ["A", "10"]] },
      "끝",
    ]);
  });
});
