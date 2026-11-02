import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../../../types";
import { defaultBlueprintForPreset } from "../model/examBlueprint";
import { generateExam, questionQualityScore } from "./generateExam";
import { createSessionFromGeneratedExam } from "./createSessionFromGeneratedExam";
import { presentSessionSharedPassages } from "../../../utils/sharedPassageRecovery";

function sheet(id: string, body: string, score: number, important = false): WrongAnswerEntry {
  return {
    id, title: id, subject: "수학", entryKind: "problem_sheet", question: `1. ${body}\n① 가\n② 나`, questionImages: [], difficult: false, difficulty: "medium", difficultyScore: score, myAnswer: "", correctAnswer: "", explanationParts: [], memo: "", annotations: [], tags: [id], answerKey: [{ id: `${id}-a`, questionNumber: "1", answer: "①", explanation: "풀이", importantPoints: [], difficultyScore: score }], questionMeta: [{ questionNumber: "1", important, difficultyScore: score, updatedAt: "2026-01-01T00:00:00.000Z" }], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", mastered: false,
  };
}

describe("generateExam", () => {
  it("labels missing ratings separately from calculation defaults without changing selection scores", () => {
    const source = sheet("unrated", "미평가 문항", 60);
    source.questionMeta = [];
    source.answerKey = [];
    const before = structuredClone(source);
    const input = { entries: [source], title: "미평가", preset: "real_exam" as const, blueprint: defaultBlueprintForPreset("real_exam", 1), seed: "unrated" };
    const exam = generateExam(input);
    expect(exam.questions[0].selectionReasons).toContain("난이도 미평가 (계산 기준 50)");
    expect(exam.questions[0].selectionReasons).toContain("중요도 미평가 (계산 기준 45)");
    expect(source).toEqual(before);
    source.questionMeta = [{ questionNumber: "1", important: false, difficultyScore: 50, rating: { importanceScore: 45 }, updatedAt: "2026-10-21" }];
    const rated = generateExam(input);
    expect(rated.questions[0].selectionScore).toBe(exam.questions[0].selectionScore);
    expect(rated.questions[0].selectionReasons).toContain("난이도 50");
    expect(rated.questions[0].selectionReasons).toContain("중요도 45");
  });

  it("records intentional absence of shared content so source deletion does not add a false recovery warning", () => {
    const source = sheet("standalone", "독립 문항", 60);
    const exam = generateExam({ entries: [source], title: "독립 문항", preset: "real_exam", blueprint: defaultBlueprintForPreset("real_exam", 1), seed: "standalone" });
    expect(exam.questions[0].snapshot).toMatchObject({ passage: "", stimulusGroupId: "" });
    const session = createSessionFromGeneratedExam(exam);
    expect(presentSessionSharedPassages(session, [])).toBe(session);
    expect(session.questions[0].warning).toBeUndefined();
  });
  it("stores shared passages and their figures independently of the original entry", () => {
    const source = { ...sheet("passage-source", "첫 문제", 60),
      question: "[1~2] 다음 자료\nx=2이다. [FIGURE:shared]\n\n1. 첫 문제\n① 가\n② 나\n\n2. 둘째 문제\n① 다\n② 라",
      figures: [{ id: "shared", questionNumber: "", title: "공통 그림", caption: "공통 자료", source: "described_only" as const, description: "공통 그림" }],
    };
    const before = structuredClone(source);
    const exam = generateExam({ entries: [source], title: "지문 보존", preset: "real_exam", blueprint: defaultBlueprintForPreset("real_exam", 2), seed: "passage", filters: { similarity: "unlimited" } });
    expect(exam.questions).toHaveLength(2);
    for (const item of exam.questions) {
      expect(item.snapshot.passage).toContain("x=2");
      expect(item.snapshot.figures.map(figure => figure.id)).toContain("shared");
    }
    expect(exam.questions[0].snapshot.stimulusGroupId).toBe(exam.questions[1].snapshot.stimulusGroupId);
    expect(exam.questions[0].snapshot.stimulusGroupId).toContain(source.id);
    const resumed = presentSessionSharedPassages(createSessionFromGeneratedExam(JSON.parse(JSON.stringify(exam))), []);
    expect(resumed.questions.every(question => question.passage?.includes("x=2"))).toBe(true);
    expect(source).toEqual(before);
  });
  const entries = [sheet("a", "쉬운 고품질 문제", 25), sheet("b", "어려운 문제", 90, true), sheet("c", "다른 문제", 70)];
  it("is deterministic for the same seed and removes exact duplicate source questions", () => {
    const input = { entries, title: "세트", preset: "real_exam" as const, blueprint: defaultBlueprintForPreset("real_exam", 2), seed: "same" };
    const first = generateExam(input);
    const second = generateExam(input);
    expect(first.questions.map((item) => `${item.source.sourceEntryId}:${item.source.sourceQuestionNumber}`)).toEqual(second.questions.map((item) => `${item.source.sourceEntryId}:${item.source.sourceQuestionNumber}`));
    expect(new Set(first.questions.map((item) => item.source.sourceEntryId)).size).toBe(first.questions.length);
  });
  it("excludes only reviews strictly newer than the fixed recent-days cutoff", () => {
    const now = new Date("2026-01-08T00:00:00.000Z");
    const cutoff = now.getTime() - 7 * 86_400_000;
    const reviewedAt = (offset: number) => new Date(cutoff + offset).toISOString();
    const candidates = [-1, 0, 1].map((offset) => {
      const entry = sheet(`recent-${offset}`, `경계 ${offset}`, 60);
      entry.questionMeta = [{
        questionNumber: "1",
        important: false,
        difficultyScore: 60,
        updatedAt: "2026-01-01T00:00:00.000Z",
        review: { lastReviewedAt: reviewedAt(offset), dueAt: null, intervalDays: 0, streak: 0, history: [] },
      }];
      return entry;
    });

    const exam = generateExam({
      entries: candidates,
      title: "최근 복습 경계",
      preset: "real_exam",
      blueprint: defaultBlueprintForPreset("real_exam", 3),
      seed: "fixed-recent-cutoff",
      now,
      filters: { excludeRecentDays: 7 },
    });

    expect(exam.questions.map((question) => question.source.sourceEntryId).sort()).toEqual(["recent--1", "recent-0"]);
  });
  it("keeps locked questions during reassembly and reports a candidate shortage", () => {
    const locked = generateExam({ entries, title: "세트", preset: "hard", blueprint: defaultBlueprintForPreset("hard", 1), seed: "one" }).questions.map((item) => ({ ...item, locked: true }));
    const next = generateExam({ entries, title: "세트", preset: "hard", blueprint: defaultBlueprintForPreset("hard", 5), seed: "two", lockedQuestions: locked });
    expect(next.questions[0].source.sourceEntryId).toBe(locked[0].source.sourceEntryId);
    expect(next.generationReport.warnings).toHaveLength(1);
  });
  it("keeps quality independent from difficulty", () => {
    const easyHighQuality = questionQualityScore(entries[0], "1", entries[0].questionMeta?.[0]);
    const hardWithoutSolution = questionQualityScore({ ...entries[1], answerKey: [] }, "1", entries[1].questionMeta?.[0]);
    expect(easyHighQuality).toBeGreaterThan(70);
    expect(easyHighQuality).toBeGreaterThan(hardWithoutSolution);
  });
  it("preserves the unique structured source page and explicit crop page links in snapshots", () => {
    const source = {
      ...sheet("source-page", "페이지 연결 문제", 60),
      sourcePageImages: ["page-1.png", "page-2.png", "answer.png"],
      structuredQuestions: [{
        questionNumber: "1", questionText: "페이지 연결 문제", conditions: [], equations: [], choices: [], contentSegments: [], figureIds: [],
        source: { title: "원본", page: 2 },
      }],
      questionSourceCrops: [
        { id: "crop-page-2", questionNumber: "01번", image: "crop-2.png", page: 2, order: 0 },
        { id: "crop-page-1", questionNumber: "1", image: "crop-1.png", sourcePageImage: "page-1.png", order: 1 },
        { id: "bad-crop", questionNumber: "1", image: "crop-x.png", page: 9, order: 2 },
      ],
    } as WrongAnswerEntry;
    const generated = generateExam({ entries: [source], title: "페이지 연결", preset: "real_exam", blueprint: defaultBlueprintForPreset("real_exam", 1), seed: "page" });

    expect(generated.questions[0]?.snapshot.source).toEqual({ title: "원본", page: 2 });
    expect(generated.questions[0]?.snapshot.linkedSourcePageImages).toEqual(["page-2.png", "page-1.png"]);
  });

  it("hydrates explicit source pages for locked legacy snapshots without changing their content", () => {
    const source = {
      ...sheet("locked-source", "원문 본문", 60),
      sourcePageImages: ["p1.png", "p2.png"],
      structuredQuestions: [{ questionNumber: "1", questionText: "canonical 본문", conditions: [], equations: [], choices: [], contentSegments: [], figureIds: [], source: { page: 2 } }],
      questionSourceCrops: [{ questionNumber: "1", image: "crop.png", page: 1 }],
    } as WrongAnswerEntry;
    const locked = {
      position: 1,
      source: { sourceEntryId: source.id, sourceEntryTitle: source.title, sourceQuestionNumber: "1" },
      snapshot: { id: "locked", questionNumber: "1", question: "kept snapshot", choices: ["① kept choice"], questionImages: [], figures: [] },
      locked: true,
      selectionScore: 1,
      selectionReasons: [],
    };
    const generated = generateExam({ entries: [source], title: "locked", preset: "hard", blueprint: defaultBlueprintForPreset("hard", 1), seed: "locked", lockedQuestions: [locked] });
    expect(generated.questions[0].snapshot).toMatchObject({ question: "kept snapshot", choices: ["① kept choice"], source: { page: 2 }, linkedSourcePageImages: ["p1.png"] });
  });
});
