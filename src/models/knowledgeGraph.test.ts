import { describe, expect, it } from "vitest";
import { isKnowledgeGraphStore, knowledgeRelationKey, normalizeKnowledgeGraph, normalizeKnowledgeLabel } from "./knowledgeGraph";

const timestamp = "2026-01-01T00:00:00.000Z";
const strictEntity = { id: "entity-1", type: "concept" as const, name: "정언 명령", aliases: ["칸트 명령"], provenance: "manual" as const, createdAt: timestamp, updatedAt: timestamp };

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

  it("rejects malformed backup-shaped graph objects instead of silently emptying them", () => {
    expect(isKnowledgeGraphStore({ hello: "world" })).toBe(false);
    expect(isKnowledgeGraphStore({ entities: [], relations: [], questionLinks: [] })).toBe(true);
  });

  it("uses the canonical question number normalizer and rejects dangling strict references", () => {
    const graph = {
      entities: [strictEntity],
      relations: [],
      questionLinks: [
        { id: "q1", entityId: "entity-1", entryId: "entry-1", questionNumber: "[09]", relation: "tests" as const, provenance: "manual" as const, createdAt: timestamp },
      ],
    };
    expect(normalizeKnowledgeGraph(graph).questionLinks[0]?.questionNumber).toBe("9");
    expect(isKnowledgeGraphStore(graph)).toBe(true);
    expect(isKnowledgeGraphStore({ ...graph, relations: [{ id: "bad", fromEntityId: "entity-1", toEntityId: "missing", type: "related", provenance: "manual", createdAt: timestamp, updatedAt: timestamp }] })).toBe(false);
    expect(isKnowledgeGraphStore({ ...graph, questionLinks: [{ ...graph.questionLinks[0], entityId: "missing" }] })).toBe(false);
  });
});
