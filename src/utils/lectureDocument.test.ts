import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../types";
import {
  getLectureDocument,
  getLectureHeadings,
  normalizeLectureDocument,
  projectLegacyLearningBlocks,
} from "./lectureDocument";

function entry(partial: Partial<WrongAnswerEntry> = {}): WrongAnswerEntry {
  return {
    id: "lecture-entry-1",
    subject: "수학",
    title: "강의 자료",
    question: "",
    questionImages: [],
    entryKind: "lecture",
    difficult: false,
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

describe("lecture document projection", () => {
  it("projects legacy learningBlocks in order while preserving their IDs", () => {
    const document = getLectureDocument(entry({
      learningBlocks: [
        { id: "legacy-1", type: "concept", title: "개념", content: "정의" },
        { id: "legacy-2", type: "formula", title: "공식", content: "x = 1" },
        { id: "legacy-3", type: "diagram", title: "도형", content: "그림" },
      ],
    }));

    expect(document.blocks.map((block) => [block.id, block.type, block.content])).toEqual([
      ["legacy-1", "paragraph", "정의"],
      ["legacy-2", "math", "x = 1"],
      ["legacy-3", "figure", "그림"],
    ]);
  });

  it("returns an invalid document as an undefined normalization result", () => {
    expect(normalizeLectureDocument(undefined)).toBeUndefined();
    expect(normalizeLectureDocument(null)).toBeUndefined();
    expect(normalizeLectureDocument({ blocks: "not-an-array" })).toBeUndefined();
  });

  it("extracts headings with stable IDs, titles, and levels", () => {
    const document = normalizeLectureDocument({
      blocks: [
        { id: "intro", type: "heading", content: "  시작  ", level: 2 },
        { id: "body", type: "paragraph", content: "본문" },
        { id: "untitled", type: "heading", content: "", level: 3 },
      ],
    });

    expect(document).toBeDefined();
    expect(getLectureHeadings(document!)).toEqual([
      { id: "intro", title: "시작", level: 2 },
      { id: "untitled", title: "제목 없음", level: 3 },
    ]);
  });

  it("uses an explicit lectureDocument before legacy learningBlocks", () => {
    const document = getLectureDocument(entry({
      lectureDocument: {
        blocks: [{ id: "canonical-1", type: "heading", content: "새 문서" }],
      },
      learningBlocks: [{ id: "legacy-1", type: "concept", title: "구 문서", content: "구 내용" }],
    }));

    expect(document).toEqual({
      blocks: [{ id: "canonical-1", type: "heading", content: "새 문서" }],
    });
    expect(projectLegacyLearningBlocks([{ id: "legacy-1", type: "concept", title: "구 문서", content: "구 내용" }])).not.toEqual(document);
  });
});
