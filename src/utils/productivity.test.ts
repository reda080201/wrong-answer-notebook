import { describe, expect, it } from "vitest";
import type { AppSettings, EntryFormData, WrongAnswerEntry } from "../types";
import { buildConceptGraph, extractConceptLinks, getRelatedEntries } from "./concepts";
import { duplicateScore, findDuplicateEntry, findDuplicateEntries, similarity } from "./duplicates";
import { entryToMarkdown } from "./exportEntry";
import { validateImportedStudyData } from "./importValidation";
import { runClientIntegrityCheck } from "./integrity";
import { cleanQuestionText } from "./textCleanup";

const form: EntryFormData = {
  subject: "수학",
  title: "피타고라스",
  question: "삼각형의 [[피타고라스 정리]]",
  questionImages: [],
  entryKind: "wrong_answer",
  difficult: false,
  difficulty: "none",
  myAnswer: "",
  correctAnswer: "",
  explanationParts: [],
  memo: "",
  annotations: [],
  tags: [],
  mastered: false,
};

const entry: WrongAnswerEntry = {
  id: "e1",
  ...form,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const settings: AppSettings = {
  templates: [],
  promptTemplates: [],
  memoTemplates: [],
  importPreferences: {},
  answerViewPreferences: { viewMode: "card", hideAnswers: false },
  autoBackup: { enabled: false },
};

describe("text cleanup", () => {
  it("normalizes whitespace and inserts breaks before numbers and choices", () => {
    expect(cleanQuestionText("1. 문제  ① 답  ② 오답")).toBe("1. 문제\n① 답\n② 오답");
  });
});

describe("duplicate detection", () => {
  it("finds very similar title and question content", () => {
    expect(similarity("피타고라스 정리", "피타고라스  정리")).toBe(1);
    expect(findDuplicateEntry([entry], { ...form, question: "삼각형의 [[피타고라스 정리]]" })?.id).toBe("e1");
  });

  it("uses answer numbers and tags when ranking duplicate candidates", () => {
    const sheetData: EntryFormData = {
      ...form,
      entryKind: "problem_sheet",
      title: "중간고사",
      question: "1. 함수\n① 보기\n\n2. 그래프\n① 보기",
      tags: ["중간고사"],
      answerKey: [
        { id: "a1", questionNumber: "1", answer: "①", explanation: "", importantPoints: [] },
        { id: "a2", questionNumber: "2", answer: "②", explanation: "", importantPoints: [] },
      ],
    };
    const sheetEntry: WrongAnswerEntry = {
      ...entry,
      ...sheetData,
      id: "sheet",
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };

    expect(duplicateScore(sheetEntry, sheetData)).toBeGreaterThan(0.9);
    expect(findDuplicateEntries([sheetEntry], sheetData)[0]?.entry.id).toBe("sheet");
  });
});

describe("import validation and export", () => {
  it("reports answer key mismatches and empty answers", () => {
    const report = validateImportedStudyData({
      ...form,
      entryKind: "problem_sheet",
      question: "1. 첫 문제\n\n2. 둘째 문제",
      answerKey: [
        { id: "a1", questionNumber: "1", answer: "", explanation: "", importantPoints: [] },
        { id: "a1b", questionNumber: "1", answer: "①", explanation: "중복", importantPoints: [] },
        { id: "a3", questionNumber: "3", answer: "③", explanation: "", importantPoints: [] },
      ],
    });

    expect(report.issues.map((issue) => issue.id)).toEqual(
      expect.arrayContaining([
        "missing-answer-2",
        "extra-answer-3",
        "duplicate-answer-1",
        "empty-answer-a1",
      ]),
    );
  });

  it("matches answers against sequential display numbers when source numbers are irregular", () => {
    const report = validateImportedStudyData({
      ...form,
      entryKind: "problem_sheet",
      question: "31. 첫 문제\n\n99. 둘째 문제",
      answerKey: [
        { id: "a1", questionNumber: "1", answer: "①", explanation: "표시 번호 연결", importantPoints: [] },
        { id: "a2", questionNumber: "99", answer: "②", explanation: "원문 번호 연결", importantPoints: [] },
      ],
    });

    expect(report.questionNumbers).toEqual(["1", "2"]);
    expect(report.issues.map((issue) => issue.id)).not.toContain("missing-answer-1");
    expect(report.issues.map((issue) => issue.id)).not.toContain("missing-answer-2");
  });

  it("normalizes answer numbers before reporting extra answers", () => {
    const report = validateImportedStudyData({
      ...form,
      entryKind: "problem_sheet",
      question: "1. 첫 문제\n\n2. 둘째 문제",
      answerKey: [
        { id: "a1", questionNumber: "01", answer: "①", explanation: "", importantPoints: [] },
        { id: "a2", questionNumber: "2번", answer: "②", explanation: "", importantPoints: [] },
      ],
    });

    expect(report.issues.map((issue) => issue.id)).not.toContain("extra-answer-01");
    expect(report.issues.map((issue) => issue.id)).not.toContain("extra-answer-2번");
  });

  it("warns when GPT appears to assign the same difficulty to every answer", () => {
    const report = validateImportedStudyData({
      ...form,
      entryKind: "problem_sheet",
      question: "1. 첫 문제\n\n2. 둘째 문제\n\n3. 셋째 문제",
      answerKey: [
        { id: "a1", questionNumber: "1", answer: "①", explanation: "풀이", importantPoints: [], difficulty: "medium" },
        { id: "a2", questionNumber: "2", answer: "②", explanation: "풀이", importantPoints: [], difficulty: "medium" },
        { id: "a3", questionNumber: "3", answer: "③", explanation: "풀이", importantPoints: [], difficulty: "medium" },
      ],
    });

    expect(report.issues.map((issue) => issue.id)).toContain("uniform-answer-difficulty");
  });

  it("warns when problem-specific notes appear in the global memo", () => {
    const report = validateImportedStudyData({
      ...form,
      entryKind: "problem_sheet",
      question: "1. 첫 문제",
      memo: "문제 1번: 조건 해석을 다시 확인",
      answerKey: [
        { id: "a1", questionNumber: "1", answer: "①", explanation: "풀이", importantPoints: [] },
      ],
    });

    expect(report.issues.map((issue) => issue.id)).toContain("question-note-in-global-memo");
  });

  it("exports questions, memo, answer key, concepts, difficulty, and notes to markdown", () => {
    const markdown = entryToMarkdown({
      ...entry,
      entryKind: "problem_sheet",
      memo: "중요 메모",
      answerKey: [
        {
          id: "a1",
          questionNumber: "1",
          answer: "③",
          explanation: "풀이",
          notes: "문제별 메모",
          importantPoints: ["핵심"],
          difficulty: "medium",
          concepts: ["함수"],
        },
      ],
    });

    expect(markdown).toContain("## 답안지");
    expect(markdown).toContain("- 난이도: 중");
    expect(markdown).toContain("- 개념: 함수");
    expect(markdown).toContain("- 문제별 메모: 문제별 메모");
  });
});

describe("concept utilities", () => {
  it("extracts links and builds related graph", () => {
    const concept: WrongAnswerEntry = {
      ...entry,
      id: "c1",
      entryKind: "concept",
      title: "피타고라스 정리",
      question: "직각삼각형 공식",
    };
    const graph = buildConceptGraph([entry, concept]);

    expect(extractConceptLinks(entry.question)).toEqual(["피타고라스 정리"]);
    expect(graph.edges.some((edge) => edge.from === "e1")).toBe(true);
    expect(getRelatedEntries(concept, [entry, concept]).map((item) => item.id)).toEqual(["e1"]);
  });
});

describe("integrity check", () => {
  it("reports empty templates and bad review dates", () => {
    const report = runClientIntegrityCheck(
      [
        {
          ...entry,
          review: {
            dueAt: "not-a-date",
            intervalDays: 0,
            streak: 0,
            history: [],
          },
        },
      ],
      {
        ...settings,
        templates: [{ id: "t1", name: "", entryKind: "wrong_answer", data: {} }],
      },
    );

    expect(report.issues.map((issue) => issue.severity)).toContain("error");
    expect(report.issues.some((issue) => issue.id === "empty-template-t1")).toBe(true);
  });
});
