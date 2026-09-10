import type { KnowledgeGraphStore, KnowledgeEntity, KnowledgeRelation, WrongAnswerEntry } from "../../../types";
import { projectLearningBlocks } from "./learningHub";
import { findCanonicalKnowledgeEntities, normalizeKnowledgeLabel } from "../../../models/knowledgeGraph";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";

function legacyEntityId(label: string) {
  return `legacy:concept:${normalizeKnowledgeLabel(label)}`;
}

/** Builds a read-only compatibility projection from existing Learning Blocks. */
export function projectLegacyKnowledgeGraph(graph: KnowledgeGraphStore, entries: WrongAnswerEntry[]): KnowledgeGraphStore {
  const entities = [...graph.entities];
  const relations = [...graph.relations];
  const questionLinks = [...graph.questionLinks];
  const entityIds = new Set(entities.map((entity) => entity.id));
  const relationKeys = new Set(relations.map((relation) => `${relation.fromEntityId}:${relation.toEntityId}:${relation.type}`));
  const linkKeys = new Set(questionLinks.map((link) => `${link.entityId}:${link.entryId}:${link.questionNumber}:${link.relation}`));
  const addEntity = (name: string, subject: string | undefined, timestamp: string): KnowledgeEntity | undefined => {
    const normalized = normalizeKnowledgeLabel(name);
    if (!normalized) return undefined;
    const id = `${legacyEntityId(normalized)}:${normalizeKnowledgeLabel(subject ?? "all")}`;
    const matches = findCanonicalKnowledgeEntities(entities, { name, aliases: [], type: "concept", subject });
    const existing = matches.length === 1 ? matches[0] : entities.find((entity) => entity.id === id);
    if (existing) return existing;
    const entity: KnowledgeEntity = { id, type: "concept", name: name.trim(), aliases: [], subject, provenance: "import", createdAt: timestamp, updatedAt: timestamp };
    entities.push(entity);
    entityIds.add(id);
    return entity;
  };
  const addRelation = (fromEntityId: string, toEntityId: string, timestamp: string): void => {
    if (fromEntityId === toEntityId) return;
    const [from, to] = [fromEntityId, toEntityId].sort();
    const key = `${from}:${to}:related`;
    if (relationKeys.has(key)) return;
    const relation: KnowledgeRelation = { id: `legacy:relation:${from}:${to}`, fromEntityId: from, toEntityId: to, type: "related", provenance: "import", createdAt: timestamp, updatedAt: timestamp };
    relations.push(relation);
    relationKeys.add(key);
  };
  const addLink = (entityId: string, entryId: string, questionNumber: string, timestamp: string): void => {
    const number = normalizeQuestionNumber(questionNumber);
    if (!number || !entityIds.has(entityId)) return;
    const key = `${entityId}:${entryId}:${number}:associated_with`;
    if (linkKeys.has(key)) return;
    questionLinks.push({ id: `legacy:link:${key}`, entityId, entryId, questionNumber: number, relation: "associated_with", provenance: "import", createdAt: timestamp });
    linkKeys.add(key);
  };

  for (const item of projectLearningBlocks(entries)) {
    const timestamp = item.sourceEntry.updatedAt || item.sourceEntry.createdAt || "1970-01-01T00:00:00.000Z";
    const source = addEntity(item.block.title, item.sourceSubject || undefined, timestamp);
    if (!source) continue;
    for (const label of item.block.relatedConcepts ?? []) {
      const target = addEntity(label, item.sourceSubject || undefined, timestamp);
      if (target) addRelation(source.id, target.id, timestamp);
    }
    for (const reference of item.block.sourceReferences ?? []) {
      const questionNumber = reference.questionNumber ?? item.block.sourceQuestionNumber;
      if (questionNumber) addLink(source.id, reference.entryId, questionNumber, timestamp);
    }
  }
  for (const entry of entries.filter((item) => item.entryKind === "concept" && item.title.trim())) {
    const concept = addEntity(entry.title, entry.subject || undefined, entry.updatedAt || entry.createdAt || "1970-01-01T00:00:00.000Z");
    if (!concept) continue;
    // Entry associations do not imply a question identity and must not invent one.
  }
  return { entities, relations, questionLinks };
}
