import type { KnowledgeGraphStore, KnowledgeEntity, KnowledgeRelation, WrongAnswerEntry } from "../../../types";
import { projectLearningBlocks } from "./learningHub";
import { normalizeKnowledgeLabel } from "../../../models/knowledgeGraph";
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
  const linkKeys = new Set(questionLinks.map((link) => `${link.entityId}:${link.entryId}:${link.questionNumber}`));
  const now = new Date().toISOString();
  const addEntity = (name: string): KnowledgeEntity | undefined => {
    const normalized = normalizeKnowledgeLabel(name);
    if (!normalized) return undefined;
    const id = legacyEntityId(normalized);
    const existing = entities.find((entity) => entity.id === id);
    if (existing) return existing;
    const entity: KnowledgeEntity = { id, type: "concept", name: name.trim(), aliases: [], provenance: "import", createdAt: now, updatedAt: now };
    entities.push(entity);
    entityIds.add(id);
    return entity;
  };
  const addRelation = (fromEntityId: string, toEntityId: string): void => {
    if (fromEntityId === toEntityId) return;
    const [from, to] = [fromEntityId, toEntityId].sort();
    const key = `${from}:${to}:related`;
    if (relationKeys.has(key)) return;
    const relation: KnowledgeRelation = { id: `legacy:relation:${from}:${to}`, fromEntityId: from, toEntityId: to, type: "related", provenance: "import", createdAt: now, updatedAt: now };
    relations.push(relation);
    relationKeys.add(key);
  };
  const addLink = (entityId: string, entryId: string, questionNumber: string): void => {
    const number = normalizeQuestionNumber(questionNumber);
    if (!number || !entityIds.has(entityId)) return;
    const key = `${entityId}:${entryId}:${number}`;
    if (linkKeys.has(key)) return;
    questionLinks.push({ id: `legacy:link:${key}`, entityId, entryId, questionNumber: number, relation: "associated_with", provenance: "import", createdAt: now });
    linkKeys.add(key);
  };

  for (const item of projectLearningBlocks(entries)) {
    const source = addEntity(item.block.title);
    if (!source) continue;
    for (const label of [...(item.block.relatedConcepts ?? []), ...(item.block.keywords ?? [])]) {
      const target = addEntity(label);
      if (target) addRelation(source.id, target.id);
    }
    for (const reference of item.block.sourceReferences ?? []) {
      addLink(source.id, reference.entryId, reference.questionNumber ?? item.block.sourceQuestionNumber ?? "1");
    }
  }
  for (const entry of entries.filter((item) => item.entryKind === "concept" && item.title.trim())) {
    const concept = addEntity(entry.title);
    if (!concept) continue;
    for (const linkedEntryId of entry.linkedEntryIds ?? []) addLink(concept.id, linkedEntryId, "1");
  }
  return { entities, relations, questionLinks };
}
