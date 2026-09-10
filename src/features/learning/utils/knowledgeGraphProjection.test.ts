import { describe, expect, it } from "vitest";
import { projectLegacyKnowledgeGraph } from "./knowledgeGraphProjection";

describe("projectLegacyKnowledgeGraph", () => {
  it("exposes existing learning blocks as non-persisted compatible entities and links", () => {
    const result = projectLegacyKnowledgeGraph({ entities: [], relations: [], questionLinks: [] }, [{
      id: "lecture-1",
      entryKind: "lecture",
      title: "윤리 개념",
      subject: "생활과 윤리",
      question: "",
      myAnswer: "",
      correctAnswer: "",
      explanationParts: [],
      tags: [],
      memo: "",
      difficult: false,
      annotations: [],
      images: [],
      explanationImages: [],
      questionImages: [],
      answerKey: [],
      figures: [],
      learningBlocks: [{ id: "block-1", type: "concept", title: "정언명령", content: "", keywords: ["킬러", "주의"], relatedConcepts: ["칸트"], sourceReferences: [{ entryId: "sheet-1", questionNumber: "9" }] }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      mastered: false,
    }]);
    expect(result.entities.map((entity) => entity.name)).toEqual(expect.arrayContaining(["정언명령", "칸트"]));
    expect(result.entities.map((entity) => entity.name)).not.toEqual(expect.arrayContaining(["킬러", "주의"]));
    expect(result.entities.every((entity) => entity.subject === "생활과 윤리")).toBe(true);
    expect(result.relations).toHaveLength(1);
    expect(result.questionLinks[0]).toMatchObject({ entryId: "sheet-1", questionNumber: "9" });
    expect(result.entities.every((entity) => entity.provenance === "import")).toBe(true);
  });

  it("returns a deterministic read-only compatibility projection", () => {
    const entries = [{
      id: "lecture-1", entryKind: "lecture" as const, title: "윤리 개념", subject: "생활과 윤리", question: "", myAnswer: "", correctAnswer: "", explanationParts: [], tags: [], memo: "", difficult: false, annotations: [], images: [], explanationImages: [], questionImages: [], answerKey: [], figures: [], learningBlocks: [{ id: "block-1", type: "concept" as const, title: "정언명령", content: "", relatedConcepts: ["칸트"] }], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", mastered: false,
    }];
    expect(projectLegacyKnowledgeGraph({ entities: [], relations: [], questionLinks: [] }, entries)).toEqual(projectLegacyKnowledgeGraph({ entities: [], relations: [], questionLinks: [] }, entries));
  });
});
