import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../types";
import { getAllImageFilenames, normalizeDiagramSpec, normalizeEntry } from "./entry";

function rawEntry(partial: Partial<WrongAnswerEntry> = {}): WrongAnswerEntry {
  return {
    id: "1",
    subject: "수학",
    title: "",
    question: "대표 제목\n본문",
    questionImages: [],
    entryKind: "wrong_answer",
    difficult: true,
    difficulty: undefined,
    myAnswer: "",
    correctAnswer: "",
    explanationParts: [],
    memo: "",
    annotations: [],
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    mastered: false,
    ...partial,
  };
}

describe("normalizeEntry", () => {
  it("migrates legacy explanation and image fields", () => {
    const entry = normalizeEntry(
      rawEntry({
        explanation: "legacy explanation",
        explanationImages: ["exp.png"],
        images: ["question.png"],
      }),
    );

    expect(entry.title).toBe("대표 제목");
    expect(entry.question).toBe("본문");
    expect(entry.questionImages).toEqual(["question.png"]);
    expect(entry.explanationParts).toEqual([
      {
        id: "migrated-legacy",
        text: "legacy explanation",
        images: ["exp.png"],
      },
    ]);
  });

  it("normalizes invalid difficulty from the difficult flag", () => {
    const entry = normalizeEntry(
      rawEntry({ difficulty: "invalid" as WrongAnswerEntry["difficulty"] }),
    );

    expect(entry.difficulty).toBe("high");
  });

  it("migrates missing figures to an empty list and includes figure images in references", () => {
    const entry = normalizeEntry(
      rawEntry({
        entryKind: "problem_sheet",
        figures: [
          {
            id: "fig-1",
            questionNumber: "1",
            title: "그래프",
            caption: "교점 그래프",
            image: "graph_1.png",
            source: "gpt_cleaned",
          },
        ],
      }),
    );

    expect(normalizeEntry(rawEntry()).figures).toEqual([]);
    expect(entry.figures?.[0]).toEqual(
      expect.objectContaining({
        questionNumber: "1",
        image: "graph_1.png",
      }),
    );
    expect(getAllImageFilenames(entry)).toContain("graph_1.png");
  });

  it("normalizes persisted import audit and rejected notes", () => {
    const entry = normalizeEntry(rawEntry({
      entryKind: "problem_sheet",
      question: "01. 첫 문제",
      importAudit: {
        expectedQuestionNumbers: ["01", "2번"],
        detectedQuestionNumbers: [],
        missingQuestionNumbers: [],
        uncertainQuestionNumbers: ["#2"],
        handwritingExcluded: true,
        needsReviewCount: 0,
      },
      rejectedNotes: [" 학생 계산 ", "학생 계산"],
    }));

    expect(entry.importAudit).toEqual(expect.objectContaining({
      expectedQuestionNumbers: ["1", "2"],
      detectedQuestionNumbers: ["1"],
      missingQuestionNumbers: ["2"],
      uncertainQuestionNumbers: ["2"],
    }));
    expect(entry.rejectedNotes).toEqual(["학생 계산"]);
  });

  it("preserves original, cleaned, semantic and verification figure data", () => {
    const entry = normalizeEntry(rawEntry({ entryKind: "problem_sheet", figures: [{
      id: "bundle-1", questionNumber: "2", title: "삼각형", caption: "", source: "gpt_cleaned",
      original: { image: "original.png", sourcePageImage: "page.png", crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 } },
      cleaned: { image: "cleaned.png", generatedBy: "gpt", generatedAt: "2026-07-24T00:00:00Z", sourceImageHash: "abc", promptVersion: "figure-clean-v1" },
      semanticSpec: { type: "plane_geometry", points: [{ id: "A", label: "A", x: 0, y: 0 }] },
      verification: { status: "verified", confidence: 0.96, checks: { pointLabelsMatch: true }, blockingIssues: [], warnings: [] },
      preferredRepresentation: "cleaned",
    }] }));
    expect(entry.figures?.[0]).toMatchObject({ original: { image: "original.png" }, cleaned: { image: "cleaned.png" }, semanticSpec: { type: "plane_geometry" }, verification: { confidence: 0.96 }, preferredRepresentation: "cleaned" });
    expect(getAllImageFilenames(entry)).toEqual(expect.arrayContaining(["original.png", "page.png", "cleaned.png"]));
  });

  it("collects source pages and learning block images", () => {
    const entry = normalizeEntry(rawEntry({
      entryKind: "lecture",
      sourcePageImages: ["source-page.png"],
      learningBlocks: [{ id: "block-1", type: "concept", title: "", content: "", images: ["block.png"] }],
    }));
    expect(getAllImageFilenames(entry)).toEqual(expect.arrayContaining(["source-page.png", "block.png"]));
  });

  it("syncs legacy image fields to a verified cleaned representation", () => {
    const entry = normalizeEntry(rawEntry({ entryKind: "problem_sheet", figures: [{
      id: "bundle-2", questionNumber: "1", title: "그래프", caption: "", source: "original", image: "original.png",
      original: { image: "original.png" },
      cleaned: { image: "cleaned.png", generatedBy: "gpt", generatedAt: "2026-07-24T00:00:00Z", sourceImageHash: "abc", promptVersion: "figure-clean-v1" },
      verification: { status: "verified", confidence: 0.97, checks: {}, blockingIssues: [], warnings: [] },
    }] }));
    expect(entry.figures?.[0]).toMatchObject({ image: "cleaned.png", source: "gpt_cleaned", preferredRepresentation: "cleaned", needsReview: false });
  });

  it("uses questionMeta mistake analysis as the canonical question state", () => {
    const entry = normalizeEntry(rawEntry({
      entryKind: "problem_sheet",
      answerKey: [{
        id: "answer-1",
        questionNumber: "01",
        answer: "1",
        explanation: "풀이",
        importantPoints: [],
        mistakeAnalysis: {
          causes: [{ type: "concept_gap", severity: "high" }],
        },
      }],
      questionMeta: [{
        questionNumber: "1",
        important: true,
        updatedAt: "2026-01-01T00:00:00.000Z",
      }],
    }));

    expect(entry.answerKey?.[0].mistakeAnalysis).toBeUndefined();
    expect(entry.questionMeta?.[0].mistakeAnalysis?.primaryCause).toBe("concept_gap");
    expect(entry.questionMeta?.[0].important).toBe(true);
  });

  it("normalizes learning blocks and diagram types safely", () => {
    const entry = normalizeEntry(rawEntry({
      entryKind: "problem_sheet",
      learningBlocks: [
        {
          id: "block-1",
          type: "diagram",
          title: "접선 공식",
          content: "$f'(a)$ 확인",
          sourceQuestionNumber: "1",
          diagramType: "coordinate-graph",
          diagramSpec: {
            diagramType: "coordinate_graph",
            title: "좌표 그래프",
            curveLabel: "y=f(x)",
            pointLabels: ["A", "<svg>제거</svg>", "data:image/png;base64,AAAA"],
            interceptLabel: "x절편",
            highlights: ["순간변화율", "<svg>제거</svg>", "data:image/png;base64,AAAA"],
            params: {
              coreIdea: "교점을 좌표로 읽는다",
              raw: "<svg>bad</svg>",
              objects: [
                { type: "line", equation: "y=x", label: "직선" },
                { type: "image", label: "data:image/png;base64,AAAA" },
              ],
            },
          } as never,
        },
        {
          id: "block-2",
          type: "unknown" as never,
          title: "잘못된 다이어그램",
          content: "",
          diagramType: "raw-svg" as never,
        },
      ],
      answerKey: [
        {
          id: "answer-1",
          questionNumber: "1",
          answer: "②",
          explanation: "",
          importantPoints: [],
          diagramType: "absolute_value_corner" as never,
          diagramSpec: {
            type: "absolute-value-corner",
            title: "절댓값 코너",
            cornerLabel: "x=0",
            leftSlopeLabel: "좌기울기 -1",
            rightSlopeLabel: "우기울기 1",
          },
        },
        {
          id: "answer-2",
          questionNumber: "2",
          answer: "③",
          explanation: "",
          importantPoints: [],
          diagramType: "unsafe" as never,
        },
      ],
    }));

    expect(entry.learningBlocks).toEqual([
      expect.objectContaining({
        type: "diagram",
          title: "접선 공식",
          diagramType: "coordinate-graph",
          diagramSpec: expect.objectContaining({
            type: "coordinate-graph",
            title: "좌표 그래프",
            curveLabel: "y=f(x)",
            pointLabels: ["A"],
            interceptLabel: "x절편",
            highlights: ["순간변화율"],
            params: expect.objectContaining({
              coreIdea: "교점을 좌표로 읽는다",
              objects: [
                expect.objectContaining({ type: "line", equation: "y=x", label: "직선" }),
                expect.objectContaining({ type: "image" }),
              ],
            }),
          }),
        }),
      expect.objectContaining({
        type: "concept",
        title: "잘못된 다이어그램",
        diagramType: undefined,
      }),
    ]);
    expect(entry.answerKey?.[0].diagramType).toBe("absolute-value-corner");
    expect(entry.answerKey?.[0].diagramSpec).toEqual(expect.objectContaining({
      type: "absolute-value-corner",
      cornerLabel: "x=0",
    }));
    expect(entry.answerKey?.[1].diagramType).toBeUndefined();
  });

  it("normalizes diagram specs without accepting raw markup or unsupported types", () => {
    expect(normalizeDiagramSpec({
      diagramType: "geometry_helper",
      title: "기하 구조",
      params: {
        coreIdea: "원과 직선의 교점",
        unsafe: "<iframe></iframe>",
        objects: [
          { type: "circle", radius: 2, label: "x^2+y^2=4" },
          { type: "line", equation: "y=tx+t", label: "직선" },
        ],
        highlight: ["PR", "QS", "data:image/png;base64,AAAA"],
      },
    })).toEqual(expect.objectContaining({
      type: "geometry-helper",
      title: "기하 구조",
      params: expect.objectContaining({
        coreIdea: "원과 직선의 교점",
        objects: [
          expect.objectContaining({ type: "circle", radius: 2, label: "x^2+y^2=4" }),
          expect.objectContaining({ type: "line", equation: "y=tx+t", label: "직선" }),
        ],
        highlight: ["PR", "QS"],
      }),
    }));
    expect(normalizeDiagramSpec({
      type: "piecewise-differentiability",
      title: "구간별 확인",
      boundaryLabel: "x=1",
      leftLabel: "좌",
      rightLabel: "우",
      conditionLabel: "연속과 미분계수",
      highlights: ["함숫값 비교", "<script>alert(1)</script>"],
      extra: "<svg></svg>",
    })).toEqual({
      type: "piecewise-differentiability",
      title: "구간별 확인",
      xLabel: undefined,
      yLabel: undefined,
      highlights: ["함숫값 비교"],
      boundaryLabel: "x=1",
      leftLabel: "좌",
      rightLabel: "우",
      conditionLabel: "연속과 미분계수",
    });
    expect(normalizeDiagramSpec({ type: "raw-svg", title: "x" })).toBeUndefined();
    expect(normalizeDiagramSpec({ type: "derivative-tangent", title: "<svg>bad</svg>" })).toEqual(
      expect.objectContaining({ type: "derivative-tangent", title: undefined }),
    );
  });

  it("normalizes every supported extended diagram spec", () => {
    expect(normalizeDiagramSpec({
      type: "normal-distribution",
      meanLabel: "평균",
      sigmaLabels: ["-1σ", "+1σ"],
      shadedRegionLabel: "P(X>a)",
    })).toEqual(expect.objectContaining({
      type: "normal-distribution",
      meanLabel: "평균",
      sigmaLabels: ["-1σ", "+1σ"],
      shadedRegionLabel: "P(X>a)",
    }));
    expect(normalizeDiagramSpec({
      type: "probability-tree",
      rootLabel: "시작",
      branchLabels: ["A", "B"],
      outcomeLabels: ["성공", "실패"],
    })).toEqual(expect.objectContaining({ type: "probability-tree", rootLabel: "시작" }));
    expect(normalizeDiagramSpec({
      type: "venn-diagram",
      setLabels: ["A", "B"],
      intersectionLabel: "A∩B",
      outsideLabel: "전체-A",
    })).toEqual(expect.objectContaining({ type: "venn-diagram", intersectionLabel: "A∩B" }));
    expect(normalizeDiagramSpec({
      type: "geometry-helper",
      shapeLabel: "삼각형",
      angleLabels: ["A", "B", "C"],
      lengthLabels: ["a", "b", "c"],
    })).toEqual(expect.objectContaining({ type: "geometry-helper", angleLabels: ["A", "B", "C"] }));
    expect(normalizeDiagramSpec({
      type: "trig-unit-circle",
      angleLabel: "θ",
      sinLabel: "sin θ",
      cosLabel: "cos θ",
      pointLabel: "(cos θ, sin θ)",
    })).toEqual(expect.objectContaining({ type: "trig-unit-circle", angleLabel: "θ" }));
    expect(normalizeDiagramSpec({
      type: "sequence-flow",
      startLabel: "a1",
      ruleLabel: "×2+1",
      termLabels: ["a1", "a2", "a3"],
    })).toEqual(expect.objectContaining({ type: "sequence-flow", termLabels: ["a1", "a2", "a3"] }));
  });
});
