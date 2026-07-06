import { describe, expect, it } from "vitest";
import {
  convertConceptKnowledge,
  isConceptKnowledgeJson,
  normalizeAppCompatibleEntries,
} from "./conceptKnowledgeImport";

const fixture = {
  title: "생활과 윤리 수능 개념",
  note: "II~VI 단원을 추가 확장하면 된다.",
  scope: {
    subject: "사회",
    examFocus: "사상가별 판단 기준을 구분한다.",
  },
  units: [
    {
      unitId: "I",
      unitName: "현대의 삶과 실천 윤리",
      examCore: "윤리학의 구분과 적용을 이해한다.",
      commonTraps: ["기술 윤리와 메타 윤리를 혼동하지 않는다."],
      chapters: [
        {
          chapterId: "01",
          chapterName: "윤리학의 종류",
          concepts: [
            {
              name: "윤리학",
              definition: "인간 행위의 옳고 그름을 탐구하는 학문",
              examPoints: ["규범 윤리학과 메타 윤리학 구분"],
            },
            {
              name: "메타 윤리학",
              definition: "윤리 언어의 의미와 논리 구조를 분석한다.",
              examPoints: ["도덕 판단의 의미 분석"],
            },
          ],
        },
      ],
    },
  ],
  thinkerMatrix: [
    {
      name: "소크라테스",
      keywords: ["지덕복 합일", "무지의 자각"],
      examJudgment: "앎과 덕의 관계를 중시한다.",
    },
  ],
  examSolvingRules: ["선지의 핵심 술어를 먼저 표시한다."],
  minimalKeywordMap: {
    규범윤리학: ["옳고 그름", "실천 지침"],
  },
};

describe("conceptKnowledgeImport", () => {
  it("detects nested concept knowledge JSON", () => {
    expect(isConceptKnowledgeJson(fixture)).toBe(true);
    expect(isConceptKnowledgeJson({ question: "1. 문제", answerKey: [] })).toBe(false);
  });

  it("converts concepts into multiple concept entries", () => {
    const result = convertConceptKnowledge(fixture, "concepts", "기타");

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toEqual(expect.objectContaining({
      entryKind: "concept",
      subject: "사회",
      title: "윤리학",
      question: "인간 행위의 옳고 그름을 탐구하는 학문",
    }));
    expect(result.entries[0].learningBlocks?.some((block) => block.type === "warning")).toBe(true);
    expect(result.warnings[0]).toContain("일부 단원");
  });

  it("converts units and whole file into lecture learning blocks", () => {
    const unitLectures = convertConceptKnowledge(fixture, "unit-lectures", "기타");
    const singleLecture = convertConceptKnowledge(fixture, "single-lecture", "기타");

    expect(unitLectures.entries).toHaveLength(1);
    expect(unitLectures.entries[0].entryKind).toBe("lecture");
    expect(unitLectures.entries[0].learningBlocks?.some((block) => block.title.includes("판단 기준"))).toBe(true);
    expect(singleLecture.entries[0].learningBlocks?.some((block) => block.title.includes("풀이 규칙"))).toBe(true);
    expect(singleLecture.entries[0].learningBlocks?.some((block) => block.title.includes("키워드 맵"))).toBe(true);
  });

  it("normalizes app-compatible entries JSON", () => {
    const entries = normalizeAppCompatibleEntries({
      entries: [
        {
          entryKind: "concept",
          subject: "사회",
          title: "공리주의",
          question: "최대 행복을 중시한다.",
          learningBlocks: [{ type: "concept", title: "공리주의", content: "최대 행복" }],
        },
      ],
    }, "기타");

    expect(entries).toHaveLength(1);
    expect(entries[0].entryKind).toBe("concept");
    expect(entries[0].learningBlocks?.[0].title).toBe("공리주의");
  });
});
