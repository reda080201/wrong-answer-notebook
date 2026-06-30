import { describe, expect, it } from "vitest";
import { isImportJson, parseImportedStudyText, readImportFile } from "./importStudyText";

describe("importStudyText", () => {
  it("turns plain text into a problem sheet import", () => {
    const result = parseImportedStudyText("1. 문제  ① 답", "midterm.txt", "국어");

    expect(result.detectedFormat).toBe("text");
    expect(result.data.entryKind).toBe("problem_sheet");
    expect(result.data.subject).toBe("국어");
    expect(result.data.title).toBe("midterm");
    expect(result.data.question).toBe("1. 문제\n① 답");
    expect(result.data.tags).toEqual([]);
  });

  it("maps simple JSON fields into form data", () => {
    const result = parseImportedStudyText(
      JSON.stringify({
        title: "기말고사",
        subject: "영어",
        question: "1. choose  ① A",
        tags: ["기말", "문법"],
        memo: "GPT 변환",
      }),
      undefined,
      "수학",
    );

    expect(result.detectedFormat).toBe("json");
    expect(result.data.title).toBe("기말고사");
    expect(result.data.subject).toBe("영어");
    expect(result.data.question).toBe("1. choose\n① A");
    expect(result.data.tags).toEqual(["기말", "문법"]);
    expect(result.data.memo).toBe("GPT 변환");
  });

  it("maps concept JSON into concept form data", () => {
    const result = parseImportedStudyText(
      JSON.stringify({
        entryKind: "concept",
        title: "이차함수",
        subject: "수학",
        summary: "그래프는 포물선이다.",
        memo: "꼭짓점과 축을 먼저 확인",
        tags: ["함수"],
        checklist: ["꼭짓점 공식 확인", { text: "축의 방정식 암기", checked: true }],
      }),
      undefined,
      "국어",
    );

    expect(result.detectedFormat).toBe("json");
    expect(result.data.entryKind).toBe("concept");
    expect(result.data.subject).toBe("수학");
    expect(result.data.title).toBe("이차함수");
    expect(result.data.question).toBe("그래프는 포물선이다.");
    expect(result.data.memo).toBe("꼭짓점과 축을 먼저 확인");
    expect(result.data.tags).toEqual(["함수"]);
    expect(result.data.checklist).toEqual([
      { id: "import-check-1", text: "꼭짓점 공식 확인", checked: false },
      { id: "import-check-2", text: "축의 방정식 암기", checked: true },
    ]);
  });

  it("leaves tags empty when JSON does not provide them", () => {
    const result = parseImportedStudyText(
      JSON.stringify({
        title: "태그 없는 시험지",
        question: "1. 문제",
      }),
    );

    expect(result.detectedFormat).toBe("json");
    expect(result.data.tags).toEqual([]);
  });

  it("normalizes JSON figures and rejects unsafe image names", () => {
    const result = parseImportedStudyText(
      JSON.stringify({
        title: "도표 포함 시험지",
        question: "1. 그래프를 보고 답하시오.",
        figures: [
          {
            questionNumber: "1",
            title: "1번 그래프",
            caption: "교점 그래프",
            image: "graph_1.png",
            source: "gpt_cleaned",
          },
          {
            questionNumber: "2",
            title: "잘못된 이미지",
            caption: "경로가 들어간 이미지",
            image: "../bad.png",
          },
        ],
      }),
    );

    expect(result.data.figures?.[0]).toEqual(
      expect.objectContaining({
        questionNumber: "1",
        image: "graph_1.png",
        source: "gpt_cleaned",
        needsReview: false,
      }),
    );
    expect(result.data.figures?.[1]).toEqual(
      expect.objectContaining({
        questionNumber: "2",
        image: undefined,
        needsReview: true,
      }),
    );
  });

  it("recomputes import audit and removes rejected handwriting from study fields", () => {
    const result = parseImportedStudyText(JSON.stringify({
      title: "감사 시험지",
      question: "1. 인쇄 문제\n학생풀이 x=3",
      memo: "전체 메모 학생풀이 x=3",
      rejectedNotes: ["학생풀이 x=3"],
      answerKey: [{
        questionNumber: "1",
        answer: "2 학생풀이 x=3",
        explanation: "인쇄 해설",
        importantPoints: [],
      }],
      audit: {
        expectedQuestionNumbers: ["01", "2번"],
        detectedQuestionNumbers: ["99"],
        missingQuestionNumbers: [],
        uncertainQuestionNumbers: ["#2"],
        handwritingExcluded: true,
        needsReviewCount: 0,
      },
    }));

    expect(result.data.question).not.toContain("학생풀이");
    expect(result.data.memo).not.toContain("학생풀이");
    expect(result.data.answerKey?.[0].answer).toBe("2");
    expect(result.data.rejectedNotes).toEqual(["학생풀이 x=3"]);
    expect(result.data.importAudit).toEqual(expect.objectContaining({
      expectedQuestionNumbers: ["1", "2"],
      detectedQuestionNumbers: ["1"],
      missingQuestionNumbers: ["2"],
      uncertainQuestionNumbers: ["2"],
      handwritingExcluded: true,
      needsReviewCount: 1,
    }));
  });

  it("merges JSON important notes into memo and normalizes answer key", () => {
    const result = parseImportedStudyText(
      JSON.stringify({
        title: "답안 포함 시험지",
        question: "1. 문제",
        memo: "전체 메모",
        importantNotes: ["조건 해석", "그래프 교점"],
        answerKey: [
          {
            questionNumber: "1",
            answer: "③",
            explanation: "조건을 대입한다.",
            importantPoints: ["보기 비교"],
            needsReview: true,
            sourceNote: "번호 연결 확인 필요",
          },
          {
            questionNumber: 2,
            answer: null,
            explanation: "잘못된 항목도 안전 보정",
            importantPoints: "핵심",
          },
        ],
      }),
    );

    expect(result.data.memo).toContain("전체 메모");
    expect(result.data.memo).toContain("중요 포인트");
    expect(result.data.memo).toContain("- 조건 해석");
    expect(result.data.answerKey?.[0]).toEqual(
      expect.objectContaining({
        questionNumber: "1",
        answer: "③",
        explanation: "조건을 대입한다.",
        importantPoints: ["보기 비교"],
        needsReview: true,
        sourceNote: "번호 연결 확인 필요",
      }),
    );
    expect(result.data.answerKey?.[1]).toEqual(
      expect.objectContaining({
        questionNumber: "2",
        answer: "",
        explanation: "잘못된 항목도 안전 보정",
        importantPoints: ["핵심"],
      }),
    );
  });

  it("maps JSON solution fields for single wrong-answer explanations", () => {
    const result = parseImportedStudyText(
      JSON.stringify({
        question: "1. x + 1 = 2",
        correctAnswer: "x = 1",
        explanationParts: [
          { id: "solution", text: "양변에서 1을 뺀다.", images: [] },
        ],
      }),
    );

    expect(result.data.correctAnswer).toBe("x = 1");
    expect(result.data.explanationParts?.[0]).toEqual(
      expect.objectContaining({
        id: "solution",
        text: "양변에서 1을 뺀다.",
      }),
    );
  });

  it("maps JSON concepts and per-question difficulty metadata", () => {
    const result = parseImportedStudyText(
      JSON.stringify({
        question: "1. 함수 문제",
        concepts: ["함수"],
        difficultyByQuestion: {
          1: { difficulty: "high", concepts: ["그래프"] },
        },
        answerKey: [
          {
            questionNumber: "1",
            answer: "③",
            explanation: "교점을 확인한다.",
          },
        ],
      }),
    );

    expect(result.data.question).toContain("[[함수]]");
    expect(result.data.memo).toContain("[[함수]]");
    expect(result.data.difficulty).toBe("none");
    expect(result.data.answerKey?.[0]).toEqual(
      expect.objectContaining({
        difficulty: "high",
        concepts: ["그래프"],
      }),
    );
  });

  it("maps structured answer explanation fields from JSON", () => {
    const result = parseImportedStudyText(
      JSON.stringify({
        question: "1. 함수 문제",
        answerKey: [
          {
            questionNumber: "1",
            answer: "③",
            explanation: "원문 해설 전체",
            strategy: "그래프 교점을 먼저 본다",
            steps: ["조건 정리", "교점 확인"],
            choiceJudgements: [{ marker: "①", text: "교점 조건을 만족하지 않음" }],
            wrongPoint: "절편과 교점을 혼동",
            reviewPoint: "교점 정의 복습",
          },
        ],
      }),
    );

    expect(result.data.answerKey?.[0]).toEqual(
      expect.objectContaining({
        strategy: "그래프 교점을 먼저 본다",
        steps: ["조건 정리", "교점 확인"],
        choiceJudgements: [{ marker: "①", text: "교점 조건을 만족하지 않음" }],
        wrongPoint: "절편과 교점을 혼동",
        reviewPoint: "교점 정의 복습",
      }),
    );
  });

  it("keeps problem-specific notes on answer key items", () => {
    const result = parseImportedStudyText(
      JSON.stringify({
        question: "1. 함수 문제",
        memo: "전체 메모",
        importantNotes: [
          "전체적으로 그래프 해석 확인",
          { questionNumber: "1", text: "1번은 조건 변환을 다시 보기" },
        ],
        answerKey: [
          {
            questionNumber: "1",
            answer: "③",
            explanation: "교점을 확인한다.",
            notes: "답안지의 1번 보충 메모",
          },
        ],
      }),
    );

    expect(result.data.memo).toContain("전체적으로 그래프 해석 확인");
    expect(result.data.memo).not.toContain("조건 변환을 다시 보기");
    expect(result.data.answerKey?.[0]).toEqual(
      expect.objectContaining({
        notes: expect.stringContaining("답안지의 1번 보충 메모"),
      }),
    );
    expect(result.data.answerKey?.[0].notes).toContain("조건 변환을 다시 보기");
  });

  it("maps metadata by original question number aliases", () => {
    const result = parseImportedStudyText(
      JSON.stringify({
        question: "31. 원문 번호가 큰 문제",
        difficultyByQuestion: {
          31: { difficulty: "high", notes: "원문 31번 기준 메모" },
        },
        answerKey: [
          {
            questionNumber: "1",
            answer: "④",
            explanation: "순서 표시 번호로 연결한다.",
          },
        ],
      }),
    );

    expect(result.data.answerKey?.[0]).toEqual(
      expect.objectContaining({
        difficulty: "high",
        notes: "원문 31번 기준 메모",
      }),
    );
  });

  it("splits markdown question, notes, memo and answer key sections", () => {
    const result = parseImportedStudyText(`# 문제
1. 다음 중 옳은 것은?

# 중요 포인트
- 조건을 먼저 정리

# 메모
함수 단원 확인

# 답안지
1 | ② | x값을 대입한다 | 보기 함정 확인 | 1번만 다시 볼 메모`);

    expect(result.detectedFormat).toBe("text");
    expect(result.data.question).toBe("1. 다음 중 옳은 것은?");
    expect(result.data.memo).toContain("함수 단원 확인");
    expect(result.data.memo).toContain("- 조건을 먼저 정리");
    expect(result.data.answerKey?.[0]).toEqual(
      expect.objectContaining({
        questionNumber: "1",
        answer: "②",
        explanation: "x값을 대입한다",
        importantPoints: ["보기 함정 확인"],
        notes: "1번만 다시 볼 메모",
      }),
    );
  });

  it("falls back to text when JSON is invalid or missing question", () => {
    expect(parseImportedStudyText("{ bad json", "raw.md").detectedFormat).toBe("text");
    expect(parseImportedStudyText('{"title":"빈 문제"}', "raw.md").detectedFormat).toBe("text");
  });

  it("unwraps fenced JSON from GPT replies", () => {
    const result = parseImportedStudyText('```json\n{"question":"1. 문제","title":"시험"}\n```');

    expect(result.detectedFormat).toBe("json");
    expect(result.data.title).toBe("시험");
  });

  it("extracts a JSON object from GPT replies with surrounding prose", () => {
    const result = parseImportedStudyText('아래 JSON을 사용하세요.\n{"question":"1. 문제","title":"시험"}\n완료했습니다.');

    expect(result.detectedFormat).toBe("json");
    expect(result.data.title).toBe("시험");
  });

  it("drops invalid answer difficulty values", () => {
    const result = parseImportedStudyText(
      JSON.stringify({
        question: "1. 문제",
        answerKey: [
          {
            questionNumber: "1",
            answer: "①",
            difficulty: "very-hard",
          },
        ],
      }),
    );

    expect(result.data.answerKey?.[0].difficulty).toBeUndefined();
  });

  it("does not estimate difficulty when GPT omits it", () => {
    const result = parseImportedStudyText(
      JSON.stringify({
        question: "1. 문제",
        answerKey: [
          {
            questionNumber: "1",
            answer: "①",
            explanation: "긴 풀이가 있어도 앱이 난이도를 자동으로 넣지 않는다. ".repeat(8),
            importantPoints: ["핵심", "주의"],
          },
        ],
      }),
    );

    expect(result.data.difficulty).toBe("none");
    expect(result.data.answerKey?.[0].difficulty).toBeUndefined();
  });

  it("detects import json shapes", () => {
    expect(isImportJson({ question: "문제" })).toBe(true);
    expect(isImportJson(["문제"])).toBe(false);
  });

  it("reads supported import files and rejects others", async () => {
    await expect(readImportFile(new File(["내용"], "result.md"))).resolves.toBe("내용");
    await expect(readImportFile(new File(["내용"], "result.pdf"))).rejects.toThrow(".txt, .md, .json");
  });
});
