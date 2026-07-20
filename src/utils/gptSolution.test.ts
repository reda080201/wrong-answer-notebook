import { describe, expect, it } from "vitest";
import type { EntryFormData, WrongAnswerEntry } from "../types";
import {
  buildMathSolutionPrompt,
  entryToFormData,
  mergeGptSolutionIntoEntry,
} from "./gptSolution";

const entry: WrongAnswerEntry = {
  id: "entry-1",
  subject: "수학",
  title: "이차방정식",
  question: "x^2 - 1 = 0",
  questionImages: ["q1.png"],
  entryKind: "wrong_answer",
  difficult: false,
  difficulty: "none",
  myAnswer: "",
  correctAnswer: "",
  explanationParts: [{ id: "empty", text: "", images: [] }],
  memo: "",
  annotations: [],
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  mastered: false,
};

describe("gptSolution", () => {
  it("builds a math solution prompt without tags instructions", () => {
    const prompt = buildMathSolutionPrompt(entry);

    expect(prompt).toContain("순수 JSON 객체 1개");
    expect(prompt).toContain("단계별");
    expect(prompt).toContain("needsReview");
    expect(prompt).toContain("answerKey[].notes");
    expect(prompt).toContain("strategy, steps, choiceJudgements, wrongPoint, reviewPoint");
    expect(prompt).toContain("learningBlocks");
    expect(prompt).toContain("diagramSpec");
    expect(prompt).toContain("derivative-tangent");
    expect(prompt).toContain("coordinate-graph");
    expect(prompt).toContain("sequence-flow");
    expect(prompt).toContain('learningBlocks[].type을 "diagram"');
    expect(prompt).toContain("한 문항당 최대 1개");
    expect(prompt).toContain("전체 entry learningBlocks diagram은 최대 3개");
    expect(prompt).toContain("figures[].source는 \"described_only\"");
    expect(prompt).toContain("Canvas 코드");
    expect(prompt).toContain("raw HTML, raw SVG");
    expect(prompt).toContain("diagramSpec.params");
    expect(prompt).toContain("geometry-helper");
    expect(prompt).toContain("coreIdea");
    expect(prompt).toContain("x^2+y^2=4");
    expect(prompt).toContain("첨부 이미지 1개");
    expect(prompt).toContain("tags 필드는 만들지 마");
    expect(prompt).not.toContain('"tags"');
  });

  it("fills only empty answer and explanation fields", () => {
    const base = entryToFormData(entry);
    const imported: Partial<EntryFormData> = {
      correctAnswer: "x = ±1",
      explanationParts: [{ id: "solution", text: "양변을 인수분해한다.", images: [] }],
      memo: "인수분해 확인",
    };

    const merged = mergeGptSolutionIntoEntry(base, imported, "fill");

    expect(merged.correctAnswer).toBe("x = ±1");
    expect(merged.explanationParts[0].text).toBe("양변을 인수분해한다.");
    expect(merged.memo).toBe("인수분해 확인");
  });

  it("does not overwrite existing fields in fill mode", () => {
    const base = entryToFormData({
      ...entry,
      correctAnswer: "기존 정답",
      explanationParts: [{ id: "old", text: "기존 풀이", images: [] }],
      memo: "기존 메모",
    });

    const merged = mergeGptSolutionIntoEntry(
      base,
      {
        correctAnswer: "새 정답",
        explanationParts: [{ id: "new", text: "새 풀이", images: [] }],
        memo: "새 메모",
      },
      "fill",
    );

    expect(merged.correctAnswer).toBe("기존 정답");
    expect(merged.explanationParts[0].text).toBe("기존 풀이");
    expect(merged.memo).toBe("기존 메모");
  });

  it("overwrites existing fields in overwrite mode", () => {
    const base = entryToFormData({
      ...entry,
      correctAnswer: "기존 정답",
      explanationParts: [{ id: "old", text: "기존 풀이", images: [] }],
    });

    const merged = mergeGptSolutionIntoEntry(
      base,
      {
        correctAnswer: "새 정답",
        explanationParts: [{ id: "new", text: "새 풀이", images: [] }],
      },
      "overwrite",
    );

    expect(merged.correctAnswer).toBe("새 정답");
    expect(merged.explanationParts[0].text).toBe("새 풀이");
  });

  it("preserves existing answer notes in fill mode", () => {
    const base = {
      ...entryToFormData(entry),
      entryKind: "problem_sheet" as const,
      answerKey: [
        {
          id: "a1",
          questionNumber: "1",
          answer: "",
          explanation: "",
          notes: "기존 문제별 메모",
          importantPoints: [],
        },
      ],
    };

    const merged = mergeGptSolutionIntoEntry(
      base,
      {
        answerKey: [
          {
            id: "incoming",
            questionNumber: "1",
            answer: "②",
            explanation: "새 풀이",
            notes: "새 문제별 메모",
            importantPoints: ["핵심"],
          },
        ],
      },
      "fill",
    );

    expect(merged.answerKey?.[0].notes).toBe("기존 문제별 메모");
    expect(merged.answerKey?.[0].answer).toBe("②");
  });

  it("fills structured answer fields without overwriting existing structured fields", () => {
    const base = {
      ...entryToFormData(entry),
      entryKind: "problem_sheet" as const,
      answerKey: [
        {
          id: "a1",
          questionNumber: "1",
          answer: "",
          explanation: "",
          strategy: "기존 전략",
          importantPoints: [],
        },
      ],
    };

    const merged = mergeGptSolutionIntoEntry(
      base,
      {
        answerKey: [
          {
            id: "incoming",
            questionNumber: "1",
            answer: "②",
            explanation: "원문 해설",
            strategy: "새 전략",
            steps: ["조건 정리", "대입"],
            choiceJudgements: [{ marker: "①", text: "조건 불일치" }],
            wrongPoint: "부호 실수",
            reviewPoint: "부호 확인",
            importantPoints: [],
          },
        ],
      },
      "fill",
    );

    expect(merged.answerKey?.[0]).toEqual(
      expect.objectContaining({
        strategy: "기존 전략",
        steps: ["조건 정리", "대입"],
        choiceJudgements: [{ marker: "①", text: "조건 불일치" }],
        wrongPoint: "부호 실수",
        reviewPoint: "부호 확인",
      }),
    );
  });

const richEntry: WrongAnswerEntry = {
  ...entry,
  id: 'entry-rich',
  entryKind: 'problem_sheet',
  questionMeta: [{ questionNumber: '1', important: true, bookmarkLabel: 'kill', updatedAt: '2026-01-02T00:00:00.000Z', mistakeAnalysis: { causes: [{ type: 'calculation', severity: 'medium' }], primaryCause: 'calculation' } }],
  questionContentSegments: { '1': [{ id: 'seg-1', type: 'text', text: 'condition' }] },
  sheetGroup: { groupId: 'group-1', groupTitle: 'mock', partTitle: 'math', partOrder: 1, questionRange: '1-3' },
  mistakeAnalysis: { causes: [{ type: 'concept_gap', severity: 'high', note: 'formula' }], primaryCause: 'concept_gap', preventionNote: 'review', practiceMode: 'concept_review' },
  concepts: ['quadratic', 'factor'],
  linkedEntryIds: ['linked-1', 'linked-2'],
  reviewAttempts: [{ id: 'attempt-1', entryId: 'entry-rich', reviewedAt: '2026-01-03T00:00:00.000Z', correct: false, result: 'again' }],
  review: { dueAt: '2026-02-01T00:00:00.000Z', intervalDays: 3, streak: 0, history: [] },
  checklist: [{ id: 'chk-1', text: 'check', checked: false }],
  answerKey: [{ id: 'a1', questionNumber: '1', answer: 'x=1', explanation: 'solve', importantPoints: ['core'], concepts: ['factor'], mistakeAnalysis: { causes: [{ type: 'careless', severity: 'low' }] } }],
  figures: [{ id: 'fig-1', questionNumber: '1', title: 'graph', caption: 'parabola', source: 'described_only' }],
  learningBlocks: [{ id: 'lb-1', type: 'concept', title: 'concept', content: 'summary' }],
  sourceType: 'json',
};

  it('entryToFormData preserves all EntryFormData domain fields', () => {
    const form = entryToFormData(richEntry);
    expect(form.questionMeta).toEqual(richEntry.questionMeta);
    expect(form.questionContentSegments).toEqual(richEntry.questionContentSegments);
    expect(form.sheetGroup).toEqual(richEntry.sheetGroup);
    expect(form.mistakeAnalysis).toEqual(richEntry.mistakeAnalysis);
    expect(form.concepts).toEqual(richEntry.concepts);
    expect(form.linkedEntryIds).toEqual(richEntry.linkedEntryIds);
    expect(form.reviewAttempts).toEqual(richEntry.reviewAttempts);
    expect(form.review).toEqual(richEntry.review);
    expect(form.checklist).toEqual(richEntry.checklist);
    expect(form.answerKey?.[0].mistakeAnalysis).toEqual(richEntry.answerKey?.[0].mistakeAnalysis);
    expect(form.figures).toEqual(richEntry.figures);
    expect(form.learningBlocks).toEqual(richEntry.learningBlocks);
    expect(form.sourceType).toBe('json');
    expect(form).not.toHaveProperty('id');
    expect(form).not.toHaveProperty('createdAt');
  });

  it('mergeGptSolutionIntoEntry keeps preserved domain fields through fill merge', () => {
    const base = entryToFormData(richEntry);
    const merged = mergeGptSolutionIntoEntry(base, { correctAnswer: 'x = +/-1', explanationParts: [{ id: 'solution', text: 'gpt solve', images: [] }], memo: 'gpt memo', answerKey: [{ id: 'incoming', questionNumber: '1', answer: '2', explanation: 'gpt item', importantPoints: ['gpt point'] }] }, 'fill');
    expect(merged.correctAnswer).toBe('x = +/-1');
    expect(merged.explanationParts[0].text).toBe('gpt solve');
    expect(merged.memo).toBe('gpt memo');
    expect(merged.questionMeta).toEqual(base.questionMeta);
    expect(merged.questionContentSegments).toEqual(base.questionContentSegments);
    expect(merged.sheetGroup).toEqual(base.sheetGroup);
    expect(merged.mistakeAnalysis).toEqual(base.mistakeAnalysis);
    expect(merged.concepts).toEqual(base.concepts);
    expect(merged.linkedEntryIds).toEqual(base.linkedEntryIds);
    expect(merged.reviewAttempts).toEqual(base.reviewAttempts);
    expect(merged.review).toEqual(base.review);
    expect(merged.checklist).toEqual(base.checklist);
    expect(merged.sourceType).toBe(base.sourceType);
    expect(merged.questionImages).toEqual(base.questionImages);
    expect(merged.tags).toEqual(base.tags);
  });

});
