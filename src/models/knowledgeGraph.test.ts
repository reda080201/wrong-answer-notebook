import { describe, expect, it } from "vitest";
import { knowledgeRelationKey, normalizeKnowledgeGraph, normalizeKnowledgeLabel } from "./knowledgeGraph";

describe("knowledge graph normalization", () => {
  it("normalizes labels without changing the stored display name", () => {
    expect(normalizeKnowledgeLabel("  정언  명령 ")).toBe("정언 명령");
  });

  it("removes invalid, self, and duplicate relations while canonicalizing symmetric links", () => {
    const graph = normalizeKnowledgeGraph({
      entities: [
        { id: "a", type: "concept", name: "A", aliases: [], provenance: "manual" },
        { id: "b", type: "person", name: "B", aliases: [], provenance: "manual" },
      ],
      relations: [
        { id: "r1", fromEntityId: "b", toEntityId: "a", type: "related", provenance: "manual" },
        { id: "r2", fromEntityId: "a", toEntityId: "b", type: "related", provenance: "manual" },
        { id: "self", fromEntityId: "a", toEntityId: "a", type: "related", provenance: "manual" },
        { id: "missing", fromEntityId: "a", toEntityId: "x", type: "related", provenance: "manual" },
      ],
      questionLinks: [],
    });
    expect(graph.relations).toHaveLength(1);
    expect(graph.relations[0]).toMatchObject({ fromEntityId: "a", toEntityId: "b" });
    expect(knowledgeRelationKey("b", "a", "related")).toBe(knowledgeRelationKey("a", "b", "related"));
  });

  it("keeps question links as references and drops links to unknown entities", () => {
    const graph = normalizeKnowledgeGraph({
      entities: [{ id: "concept:1", type: "concept", name: "정언 명령", aliases: [], provenance: "manual" }],
      relations: [],
      questionLinks: [
        { id: "valid", entityId: "concept:1", entryId: "entry-1", questionNumber: "9", relation: "tests", provenance: "manual" },
        { id: "invalid", entityId: "missing", entryId: "entry-2", questionNumber: "1", relation: "tests", provenance: "manual" },
      ],
    });
    expect(graph.questionLinks).toHaveLength(1);
    expect(graph.questionLinks[0]).toMatchObject({ entryId: "entry-1", questionNumber: "9" });
  });
});
