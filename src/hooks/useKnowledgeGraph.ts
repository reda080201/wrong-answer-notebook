import { useCallback, useEffect, useRef, useState } from "react";
import type {
  KnowledgeEntity,
  KnowledgeGraphStore,
  KnowledgeQuestionLink,
  KnowledgeRelation,
  KnowledgeRelationType,
} from "../types";
import { getStorageBackend } from "../services/storageBackend";
import { findCanonicalKnowledgeEntities, knowledgeRelationKey, normalizeKnowledgeGraph } from "../models/knowledgeGraph";

function withTimestamp<T>(value: T, now: string): T & { createdAt: string; updatedAt: string } {
  const candidate = value as T & { createdAt?: string };
  return { ...value, createdAt: candidate.createdAt ?? now, updatedAt: now };
}

export function useKnowledgeGraph() {
  const [graph, setGraph] = useState<KnowledgeGraphStore>({ entities: [], relations: [], questionLinks: [] });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const graphRef = useRef(graph);
  const queueRef = useRef(Promise.resolve());

  useEffect(() => { graphRef.current = graph; }, [graph]);

  const refresh = useCallback(async () => {
    const loader = getStorageBackend().loadKnowledgeGraph;
    if (!loader) { setReady(true); return; }
    try {
      const next = normalizeKnowledgeGraph(await loader());
      graphRef.current = next;
      setGraph(next);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "지식 그래프를 불러오지 못했습니다.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const loader = getStorageBackend().loadKnowledgeGraph;
    if (!loader) {
      return () => { mounted = false; };
    }
    void loader().then((value) => {
      if (!mounted) return;
      const next = normalizeKnowledgeGraph(value);
      graphRef.current = next;
      setGraph(next);
      setError(null);
      setReady(true);
    }).catch((cause: unknown) => {
      if (!mounted) return;
      setError(cause instanceof Error ? cause.message : "지식 그래프를 불러오지 못했습니다.");
      setReady(true);
    });
    return () => { mounted = false; };
  }, []);

  const persist = useCallback(async (recipe: (current: KnowledgeGraphStore) => KnowledgeGraphStore) => {
    const writer = getStorageBackend().saveKnowledgeGraph;
    if (!writer) throw new Error("현재 저장소는 지식 그래프를 지원하지 않습니다.");
    const operation = async () => {
      const next = normalizeKnowledgeGraph(recipe(graphRef.current));
      await writer(next);
      graphRef.current = next;
      setGraph(next);
      setError(null);
    };
    queueRef.current = queueRef.current.then(operation, operation);
    return queueRef.current;
  }, []);

  const createEntity = useCallback(async (input: Omit<KnowledgeEntity, "createdAt" | "updatedAt">): Promise<KnowledgeEntity> => {
    const now = new Date().toISOString();
    let resolved!: KnowledgeEntity;
    await persist((current) => {
      const matches = findCanonicalKnowledgeEntities(current.entities, input);
      if (matches.length === 1) { resolved = matches[0]; return current; }
      if (matches.length > 1) throw new Error("같은 이름 또는 별칭의 개체가 여러 개 있습니다. 기존 개체를 선택하세요.");
      resolved = withTimestamp(input, now);
      return { ...current, entities: [...current.entities, resolved] };
    });
    return resolved;
  }, [persist]);

  const ensureEntity = useCallback(async (entity: KnowledgeEntity): Promise<KnowledgeEntity> => {
    let resolved!: KnowledgeEntity;
    await persist((current) => {
      const matches = findCanonicalKnowledgeEntities(current.entities, entity);
      if (matches.length === 1) { resolved = matches[0]; return current; }
      resolved = current.entities.find((item) => item.id === entity.id) ?? entity;
      return current.entities.some((item) => item.id === resolved.id) ? current : { ...current, entities: [...current.entities, resolved] };
    });
    return resolved;
  }, [persist]);

  const saveRelation = useCallback(async (input: Omit<KnowledgeRelation, "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    await persist((current) => {
      if (!current.entities.some((entity) => entity.id === input.fromEntityId) || !current.entities.some((entity) => entity.id === input.toEntityId)) return current;
      const key = knowledgeRelationKey(input.fromEntityId, input.toEntityId, input.type as KnowledgeRelationType);
      if (current.relations.some((relation) => knowledgeRelationKey(relation.fromEntityId, relation.toEntityId, relation.type) === key)) return current;
      return { ...current, relations: [...current.relations, withTimestamp(input, now)] };
    });
  }, [persist]);

  const saveQuestionLink = useCallback(async (input: Omit<KnowledgeQuestionLink, "createdAt">) => {
    await persist((current) => current.questionLinks.some((link) => link.entityId === input.entityId && link.entryId === input.entryId && link.questionNumber === input.questionNumber && link.relation === input.relation)
      ? current
      : { ...current, questionLinks: [...current.questionLinks, { ...input, createdAt: new Date().toISOString() }] });
  }, [persist]);

  const removeEntryLinks = useCallback((entryId: string) => persist((current) => ({
    ...current,
    questionLinks: current.questionLinks.filter((link) => link.entryId !== entryId),
  })), [persist]);

  const removeRelation = useCallback((relationId: string) => persist((current) => ({
    ...current,
    relations: current.relations.filter((relation) => relation.id !== relationId),
  })), [persist]);

  const removeQuestionLink = useCallback((linkId: string) => persist((current) => ({ ...current, questionLinks: current.questionLinks.filter((link) => link.id !== linkId) })), [persist]);
  const updateEntity = useCallback((id: string, patch: Partial<Pick<KnowledgeEntity, "name" | "type" | "description" | "aliases">>) => persist((current) => ({ ...current, entities: current.entities.map((entity) => entity.id === id ? { ...entity, ...patch, updatedAt: new Date().toISOString() } : entity) })), [persist]);
  const removeEntity = useCallback((id: string) => persist((current) => ({ ...current, entities: current.entities.filter((entity) => entity.id !== id), relations: current.relations.filter((relation) => relation.fromEntityId !== id && relation.toEntityId !== id), questionLinks: current.questionLinks.filter((link) => link.entityId !== id) })), [persist]);

  return { graph, ready, error, refresh, createEntity, ensureEntity, saveRelation, saveQuestionLink, removeEntryLinks, removeRelation, removeQuestionLink, updateEntity, removeEntity };
}
