import { normalizeQuestionNumber } from "../utils/questionNumber";

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

const ENTITY_TYPES = new Set<KnowledgeEntityType>(["concept", "person", "theory", "strategy", "topic", "work"]);
const RELATION_TYPES = new Set<KnowledgeRelationType>(["related", "requires", "contrasts_with", "agrees_with", "rejects", "extends", "example_of", "tests", "associated_with"]);
const QUESTION_RELATION_TYPES = new Set<KnowledgeQuestionLink["relation"]>(["tests", "example_of", "associated_with"]);
const PROVENANCE_TYPES = new Set<KnowledgeProvenance>(["manual", "import", "ai_suggestion"]);

const SYMMETRIC_RELATIONS = new Set<KnowledgeRelationType>([
  "related",
  "contrasts_with",
  "agrees_with",
]);

export function normalizeKnowledgeLabel(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

export function findCanonicalKnowledgeEntities(entities: KnowledgeEntity[], candidate: Pick<KnowledgeEntity, "name" | "aliases" | "type" | "subject">): KnowledgeEntity[] {
  const labels = new Set([candidate.name, ...candidate.aliases].map(normalizeKnowledgeLabel).filter(Boolean));
  return entities.filter((entity) => entity.type === candidate.type && (entity.subject ?? "") === (candidate.subject ?? "") && [entity.name, ...entity.aliases].some((label) => labels.has(normalizeKnowledgeLabel(label))));
}

export function normalizeKnowledgeGraph(value: unknown): KnowledgeGraphStore {
  if (!value || typeof value !== "object") return EMPTY_KNOWLEDGE_GRAPH;
  const candidate = value as Partial<KnowledgeGraphStore>;
  const entities = Array.isArray(candidate.entities)
    ? candidate.entities.filter((item): item is KnowledgeEntity => Boolean(item && typeof item === "object" && typeof item.id === "string" && typeof item.name === "string" && ENTITY_TYPES.has(item.type as KnowledgeEntityType) && PROVENANCE_TYPES.has((item.provenance ?? "manual") as KnowledgeProvenance)))
      .map((item) => ({ ...item, aliases: Array.isArray(item.aliases) ? item.aliases.filter((alias): alias is string => typeof alias === "string") : [], provenance: item.provenance ?? "manual" }))
    : [];
  const entityIds = new Set(entities.map((entity) => entity.id));
  const relations = Array.isArray(candidate.relations)
    ? candidate.relations.filter((item): item is KnowledgeRelation => Boolean(item && typeof item === "object" && typeof item.id === "string" && entityIds.has(item.fromEntityId) && entityIds.has(item.toEntityId) && item.fromEntityId !== item.toEntityId && RELATION_TYPES.has(item.type as KnowledgeRelationType) && PROVENANCE_TYPES.has((item.provenance ?? "manual") as KnowledgeProvenance)))
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
    ? candidate.questionLinks.filter((item): item is KnowledgeQuestionLink => Boolean(item && typeof item === "object" && typeof item.id === "string" && entityIds.has(item.entityId) && typeof item.entryId === "string" && typeof item.questionNumber === "string" && QUESTION_RELATION_TYPES.has(item.relation as KnowledgeQuestionLink["relation"]) && PROVENANCE_TYPES.has((item.provenance ?? "manual") as KnowledgeProvenance)))
      .map((item) => ({ ...item, questionNumber: normalizeQuestionNumber(item.questionNumber), provenance: item.provenance ?? "manual" }))
      .filter((item) => Boolean(item.questionNumber))
    : [];
  const linkKeys = new Set<string>();
  return { entities, relations: uniqueRelations, questionLinks: questionLinks.filter((link) => { const key = `${link.entityId}:${link.entryId}:${link.questionNumber}:${link.relation}`; if (linkKeys.has(key)) return false; linkKeys.add(key); return true; }) };
}

/** Strict boundary guard for persisted/backup payloads; normalization is for trusted legacy data only. */
export function isKnowledgeGraphStore(value: unknown): value is KnowledgeGraphStore {
  return validateKnowledgeGraphStore(value) === null;
}

/**
 * Strict validation for persisted and backup boundaries. Runtime legacy
 * projection may still use normalizeKnowledgeGraph to safely read old data.
 */
export function validateKnowledgeGraphStore(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "지식 그래프는 객체여야 합니다.";
  const candidate = value as Partial<KnowledgeGraphStore>;
  if (!Array.isArray(candidate.entities) || !Array.isArray(candidate.relations) || !Array.isArray(candidate.questionLinks)) {
    return "지식 그래프에는 entities, relations, questionLinks 배열이 필요합니다.";
  }
  const ids = new Set<string>();
  for (const entity of candidate.entities) {
    if (!isNonEmptyString(entity?.id) || !isNonEmptyString(entity?.name) || !ENTITY_TYPES.has(entity.type) || !PROVENANCE_TYPES.has(entity.provenance) || !Array.isArray(entity.aliases) || !entity.aliases.every(isNonEmptyString) || !isNonEmptyString(entity.createdAt) || !isNonEmptyString(entity.updatedAt)) {
      return "지식 그래프 entity 값이 올바르지 않습니다.";
    }
    if (ids.has(entity.id)) return "지식 그래프 entity ID가 중복되었습니다.";
    ids.add(entity.id);
  }
  const relationIds = new Set<string>();
  for (const relation of candidate.relations) {
    if (!isNonEmptyString(relation?.id) || !isNonEmptyString(relation.fromEntityId) || !isNonEmptyString(relation.toEntityId) || !RELATION_TYPES.has(relation.type) || !PROVENANCE_TYPES.has(relation.provenance) || !isNonEmptyString(relation.createdAt) || !isNonEmptyString(relation.updatedAt)) {
      return "지식 그래프 relation 값이 올바르지 않습니다.";
    }
    if (relation.fromEntityId === relation.toEntityId || !ids.has(relation.fromEntityId) || !ids.has(relation.toEntityId)) return "지식 그래프 relation의 entity 참조가 올바르지 않습니다.";
    if (relationIds.has(relation.id)) return "지식 그래프 relation ID가 중복되었습니다.";
    relationIds.add(relation.id);
  }
  const linkIds = new Set<string>();
  for (const link of candidate.questionLinks) {
    if (!isNonEmptyString(link?.id) || !isNonEmptyString(link.entityId) || !isNonEmptyString(link.entryId) || !isNonEmptyString(link.questionNumber) || !QUESTION_RELATION_TYPES.has(link.relation) || !PROVENANCE_TYPES.has(link.provenance) || !isNonEmptyString(link.createdAt)) {
      return "지식 그래프 question link 값이 올바르지 않습니다.";
    }
    if (!ids.has(link.entityId)) return "지식 그래프 question link의 entity 참조가 올바르지 않습니다.";
    if (!normalizeQuestionNumber(link.questionNumber)) return "지식 그래프 question link 문항 번호가 올바르지 않습니다.";
    if (linkIds.has(link.id)) return "지식 그래프 question link ID가 중복되었습니다.";
    linkIds.add(link.id);
  }
  return null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function knowledgeRelationKey(fromEntityId: string, toEntityId: string, type: KnowledgeRelationType): string {
  const ordered = SYMMETRIC_RELATIONS.has(type) ? [fromEntityId, toEntityId].sort() : [fromEntityId, toEntityId];
  return `${ordered[0]}:${ordered[1]}:${type}`;
}
