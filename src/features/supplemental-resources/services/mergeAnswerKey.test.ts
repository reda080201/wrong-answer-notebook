import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../../../types";
import { analyzeAnswerMerge, applyAnswerMerge, getAnswerMergeResolutionIssues } from "./mergeAnswerKey";

const entry = (answerKey: WrongAnswerEntry["answerKey"] = []): WrongAnswerEntry => ({
  id: "sheet-1",
  subject: "수학",
  title: "문제지",
  question: "1. 첫 문제\n2. 둘째 문제\n3. 셋째 문제",
  questionImages: [],
  entryKind: "problem_sheet",
  difficult: false,
  myAnswer: "",
  correctAnswer: "",
  explanationParts: [],
  memo: "",
  annotations: [],
  tags: [],
  answerKey,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  mastered: false,
});

const answer = (questionNumber: string, value: string, patch: Record<string, unknown> = {}) => ({
  id: `incoming-${questionNumber}`,
  questionNumber,
  answer: value,
  explanation: "",
  importantPoints: [],
  ...patch,
});

describe("supplemental answer merge", () => {
  it("adds an answer to an existing question without replacing the entry", () => {
    const base = entry();
    const incoming = { answerKey: [answer("01번", "③")] };
    const analysis = analyzeAnswerMerge(base, incoming);
    expect(analysis.rows[0].status).toBe("add");
    const merged = applyAnswerMerge(base, incoming, [], { idFactory: () => "new-id" });
    expect(merged.answerKey).toEqual([expect.objectContaining({ id: "new-id", questionNumber: "1", answer: "③" })]);
  });

  it("supplements empty fields and preserves existing fields", () => {
    const base = entry([{ id: "existing", questionNumber: "1", answer: "③", explanation: "", importantPoints: ["기존"] }]);
    const incoming = { answerKey: [answer("문항 1", "③", { explanation: "풀이", importantPoints: ["기존"] })] };
    expect(analyzeAnswerMerge(base, incoming).rows[0].status).toBe("supplement");
    const merged = applyAnswerMerge(base, incoming, []);
    expect(merged.answerKey?.[0]).toMatchObject({ id: "existing", answer: "③", explanation: "풀이", importantPoints: ["기존"] });
  });

  it("marks a different answer as conflict and keeps the old value by default", () => {
    const base = entry([{ id: "existing", questionNumber: "1", answer: "③", explanation: "기존 풀이", importantPoints: [] }]);
    const incoming = { answerKey: [answer("1", "④", { explanation: "새 풀이" })] };
    const analysis = analyzeAnswerMerge(base, incoming);
    expect(analysis.rows[0].status).toBe("conflict");
    const kept = applyAnswerMerge(base, incoming, []);
    expect(kept.answerKey?.[0]).toMatchObject({ answer: "③", explanation: "기존 풀이" });
    const applied = applyAnswerMerge(base, incoming, [{ key: analysis.rows[0].key, fieldChoices: { answer: "incoming", explanation: "incoming" } }]);
    expect(applied.answerKey?.[0]).toMatchObject({ answer: "④", explanation: "새 풀이" });
  });

  it("applies conflict choices independently for each answer field", () => {
    const base = entry([{ id: "existing", questionNumber: "1", answer: "③", explanation: "기존 풀이", importantPoints: [] }]);
    const incoming = { answerKey: [answer("1", "④", { explanation: "새 풀이" })] };
    const analysis = analyzeAnswerMerge(base, incoming);
    const merged = applyAnswerMerge(base, incoming, [{
      key: analysis.rows[0].key,
      fieldChoices: { answer: "incoming", explanation: "existing" },
    }]);

    expect(merged.answerKey?.[0]).toMatchObject({ answer: "④", explanation: "기존 풀이" });
  });

  it("blocks duplicate numbers and preserves unmatched rows as warnings", () => {
    const base = entry();
    const analysis = analyzeAnswerMerge(base, { answerKey: [answer("2", "①"), answer("02", "②"), answer("99", "③")] });
    expect(analysis.blockingIssues).toHaveLength(1);
    expect(analysis.rows.map((row) => row.status)).toEqual(["duplicate", "duplicate", "unmatched"]);
  });

  it("requires unmatched rows to be excluded or mapped to a real target question", () => {
    const base = entry();
    const incoming = { answerKey: [answer("99", "③")] };
    const analysis = analyzeAnswerMerge(base, incoming);
    expect(getAnswerMergeResolutionIssues(base, analysis, [{ key: analysis.rows[0].key }]))
      .toContain("99번 자료를 연결할 기존 문항 번호를 지정하거나 제외해 주세요.");
    expect(getAnswerMergeResolutionIssues(base, analysis, [{
      key: analysis.rows[0].key,
      targetQuestionNumber: "2번",
    }])).toEqual([]);
    expect(() => applyAnswerMerge(base, incoming, [{ key: analysis.rows[0].key }]))
      .toThrow("기존 문항 번호");
  });

  it("appends source pages, figures, blocks, and history without mutating the source entry", () => {
    const base = entry();
    const imported = {
      sourcePageImages: ["page.png"],
      explanationParts: [{ id: "part", text: "해설", images: ["solution.png"] }],
      figures: [{ id: "figure", questionNumber: "1", title: "그래프", caption: "", image: "graph.png", source: "original" as const }],
      learningBlocks: [{ id: "block", type: "concept" as const, title: "개념", content: "내용" }],
    };
    const merged = applyAnswerMerge(base, imported, [], { resource: { id: "resource", kind: "solution", title: "해설", createdAt: "2026-01-01", updatedAt: "2026-01-01", images: ["solution.png"], appliedFields: ["explanationParts"] } });
    expect(merged.sourcePageImages).toEqual(["page.png"]);
    expect(merged.explanationParts[0]).toMatchObject({ text: "해설", images: ["solution.png"] });
    expect(merged.figures?.[0]).toMatchObject({ image: "graph.png" });
    expect(merged.learningBlocks?.[0]).toMatchObject({ title: "개념" });
    expect(merged.supplementalResources?.[0]?.title).toBe("해설");
    expect(base.sourcePageImages).toBeUndefined();
    expect(base.explanationParts).toHaveLength(0);
  });
});
