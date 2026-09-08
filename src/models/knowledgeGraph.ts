export type KnowledgeEntityType =
  | "concept"
  | "person"
  | "theory"
  | "strategy"
  | "topic"
  | "work";

export type KnowledgeRelationType =
  | "related"
  | "requires"
  | "contrasts_with"
  | "agrees_with"
  | "rejects"
  | "extends"
  | "example_of"
  | "tests"
  | "associated_with";

export type KnowledgeProvenance = "manual" | "import" | "ai_suggestion";

export interface KnowledgeEntity {
  id: string;
  type: KnowledgeEntityType;
  name: string;
  aliases: string[];
  subject?: string;
  course?: string;
  unit?: string;
  description?: string;
  provenance: KnowledgeProvenance;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeRelation {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  type: KnowledgeRelationType;
  provenance: KnowledgeProvenance;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeQuestionLink {
  id: string;
  entityId: string;
  entryId: string;
  questionNumber: string;
  relation: "tests" | "example_of" | "associated_with";
  provenance: KnowledgeProvenance;
  createdAt: string;
}

export interface KnowledgeGraphStore {
  entities: KnowledgeEntity[];
  relations: KnowledgeRelation[];
  questionLinks: KnowledgeQuestionLink[];
}

export const EMPTY_KNOWLEDGE_GRAPH: KnowledgeGraphStore = {
  entities: [],
  relations: [],
  questionLinks: [],
};

const SYMMETRIC_RELATIONS = new Set<KnowledgeRelationType>([
  "related",
  "contrasts_with",
  "agrees_with",
]);

export function normalizeKnowledgeLabel(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

export function normalizeKnowledgeGraph(value: unknown): KnowledgeGraphStore {
  if (!value || typeof value !== "object") return EMPTY_KNOWLEDGE_GRAPH;
  const candidate = value as Partial<KnowledgeGraphStore>;
  const entities = Array.isArray(candidate.entities)
    ? candidate.entities.filter((item): item is KnowledgeEntity => Boolean(item && typeof item === "object" && typeof item.id === "string" && typeof item.name === "string" && typeof item.type === "string"))
      .map((item) => ({ ...item, aliases: Array.isArray(item.aliases) ? item.aliases.filter((alias): alias is string => typeof alias === "string") : [], provenance: item.provenance ?? "manual" }))
    : [];
  const entityIds = new Set(entities.map((entity) => entity.id));
  const relations = Array.isArray(candidate.relations)
    ? candidate.relations.filter((item): item is KnowledgeRelation => Boolean(item && typeof item === "object" && typeof item.id === "string" && entityIds.has(item.fromEntityId) && entityIds.has(item.toEntityId) && item.fromEntityId !== item.toEntityId && typeof item.type === "string"))
      .map((item) => {
        if (!SYMMETRIC_RELATIONS.has(item.type)) return { ...item, provenance: item.provenance ?? "manual" };
        const [fromEntityId, toEntityId] = [item.fromEntityId, item.toEntityId].sort();
        return { ...item, fromEntityId, toEntityId, provenance: item.provenance ?? "manual" };
      })
    : [];
  const relationKeys = new Set<string>();
  const uniqueRelations = relations.filter((relation) => {
    const key = `${relation.fromEntityId}:${relation.toEntityId}:${relation.type}`;
    if (relationKeys.has(key)) return false;
    relationKeys.add(key);
    return true;
  });
  const questionLinks = Array.isArray(candidate.questionLinks)
    ? candidate.questionLinks.filter((item): item is KnowledgeQuestionLink => Boolean(item && typeof item === "object" && typeof item.id === "string" && entityIds.has(item.entityId) && typeof item.entryId === "string" && typeof item.questionNumber === "string" && typeof item.relation === "string"))
      .map((item) => ({ ...item, questionNumber: item.questionNumber.trim(), provenance: item.provenance ?? "manual" }))
    : [];
  return { entities, relations: uniqueRelations, questionLinks };
}

export function knowledgeRelationKey(fromEntityId: string, toEntityId: string, type: KnowledgeRelationType): string {
  const ordered = SYMMETRIC_RELATIONS.has(type) ? [fromEntityId, toEntityId].sort() : [fromEntityId, toEntityId];
  return `${ordered[0]}:${ordered[1]}:${type}`;
}
