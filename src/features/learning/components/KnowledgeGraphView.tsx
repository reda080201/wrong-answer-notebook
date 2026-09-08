import { useMemo, useState } from "react";
import { Link2, Plus, Unlink } from "lucide-react";
import type { KnowledgeEntity, KnowledgeGraphStore, KnowledgeRelationType } from "../../../types";
import type { QuestionBankItem } from "../../question-bank/model/questionBankTypes";
import { normalizeKnowledgeLabel } from "../../../models/knowledgeGraph";
import { useAppDialog } from "../../../shared/ui/AppDialogProvider";

interface KnowledgeGraphViewProps {
  graph: KnowledgeGraphStore;
  onEnsureEntity(entity: KnowledgeEntity): Promise<void>;
  questionBankItems: QuestionBankItem[];
  onCreateEntity(input: { id: string; type: "concept"; name: string; aliases: string[]; provenance: "manual" }): Promise<void>;
  onSaveRelation(input: { id: string; fromEntityId: string; toEntityId: string; type: KnowledgeRelationType; provenance: "manual" }): Promise<void>;
  onSaveQuestionLink(input: { id: string; entityId: string; entryId: string; questionNumber: string; relation: "tests"; provenance: "manual" }): Promise<void>;
  onRemoveRelation(id: string): Promise<void>;
  onOpenQuestion(item: QuestionBankItem): void;
  onStartReview(items: QuestionBankItem[]): void;
}

const relationLabels: Array<[KnowledgeRelationType, string]> = [
  ["related", "관련"],
  ["requires", "선행"],
  ["contrasts_with", "대조"],
  ["extends", "확장"],
];

export default function KnowledgeGraphView({
  graph,
  onEnsureEntity,
  questionBankItems,
  onCreateEntity,
  onSaveRelation,
  onSaveQuestionLink,
  onRemoveRelation,
  onOpenQuestion,
  onStartReview,
}: KnowledgeGraphViewProps) {
  const { prompt } = useAppDialog();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(graph.entities[0]?.id ?? null);
  const [relationType, setRelationType] = useState<KnowledgeRelationType>("related");
  const selected = graph.entities.find((entity) => entity.id === selectedId) ?? graph.entities[0];
  const entities = useMemo(() => {
    const key = normalizeKnowledgeLabel(query);
    if (!key) return graph.entities;
    return graph.entities.filter((entity) => normalizeKnowledgeLabel([entity.name, ...entity.aliases].join(" ")).includes(key));
  }, [graph.entities, query]);
  const relatedEntities = selected
    ? graph.relations.flatMap((relation) => {
        const otherId = relation.fromEntityId === selected.id ? relation.toEntityId : relation.toEntityId === selected.id ? relation.fromEntityId : null;
        return otherId ? [{ relation, entity: graph.entities.find((item) => item.id === otherId) }] : [];
      }).filter((item): item is { relation: typeof graph.relations[number]; entity: typeof graph.entities[number] } => Boolean(item.entity))
    : [];
  const linkedItems = selected
    ? graph.questionLinks.filter((link) => link.entityId === selected.id).map((link) => questionBankItems.find((item) => item.entryId === link.entryId && item.questionNumber === link.questionNumber)).filter((item): item is QuestionBankItem => Boolean(item))
    : [];

  const createEntity = async () => {
    const name = await prompt({ title: "개념 추가", message: "새 개념 이름을 입력하세요." });
    if (!name?.trim()) return;
    const id = `knowledge:${crypto.randomUUID()}`;
    await onCreateEntity({ id, type: "concept", name: name.trim(), aliases: [], provenance: "manual" });
    setSelectedId(id);
  };

  const saveRelationWithEntities = async (target: KnowledgeEntity) => {
    if (!selected) return;
    await onEnsureEntity(selected);
    await onEnsureEntity(target);
    await onSaveRelation({ id: `knowledge-relation:${crypto.randomUUID()}`, fromEntityId: selected.id, toEntityId: target.id, type: relationType, provenance: "manual" });
  };

  const saveQuestionLinkWithEntity = async (item: QuestionBankItem) => {
    if (!selected) return;
    await onEnsureEntity(selected);
    await onSaveQuestionLink({ id: `knowledge-link:${crypto.randomUUID()}`, entityId: selected.id, entryId: item.entryId, questionNumber: item.questionNumber, relation: "tests", provenance: "manual" });
  };

  return (
    <section className="knowledge-graph-workspace" aria-label="지식 그래프">
      <header className="knowledge-graph-toolbar">
        <div>
          <strong>개념 관계</strong>
          <span>개념과 실제 문항을 연결해 봅니다.</span>
        </div>
        <button type="button" className="ui-button ui-button--secondary" onClick={() => void createEntity()}><Plus size={16} />개념 추가</button>
      </header>
      <div className="knowledge-graph-layout">
        <aside className="knowledge-graph-outline">
          <label htmlFor="knowledge-graph-search">개념 검색</label>
          <input id="knowledge-graph-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="개념, 인물, 이론" />
          <div role="listbox" aria-label="개념 목록">
            {entities.map((entity) => (
              <button key={entity.id} type="button" role="option" aria-selected={selected?.id === entity.id} className={selected?.id === entity.id ? "is-selected" : ""} onClick={() => setSelectedId(entity.id)}>
                <span>{entity.name}</span><small>{entity.type === "concept" ? "개념" : entity.type}</small>
              </button>
            ))}
            {!entities.length && <p className="knowledge-graph-empty">일치하는 개념이 없습니다.</p>}
          </div>
        </aside>
        <main className="knowledge-graph-detail">
          {selected ? <>
            <div className="knowledge-graph-detail__heading"><div><span className="eyebrow">{selected.type}</span><h2>{selected.name}</h2><p>{selected.description || "아직 설명이 없습니다."}</p></div><span className="knowledge-graph-provenance">{selected.provenance === "import" ? "기존 자료에서 찾음" : "수동 연결"}</span></div>
            <section><h3>관련 개념</h3><div className="knowledge-graph-relations">{relatedEntities.length ? relatedEntities.map(({ relation, entity }) => <div className="knowledge-graph-relation" key={relation.id}><button type="button" onClick={() => setSelectedId(entity.id)}>{entity.name}</button><span>{relationLabels.find(([type]) => type === relation.type)?.[1] ?? relation.type}</span><button type="button" className="ui-icon-button" aria-label={`${entity.name} 연결 해제`} onClick={() => void onRemoveRelation(relation.id)}><Unlink size={15} /></button></div>) : <p className="knowledge-graph-muted">연결된 개념이 없습니다.</p>}</div>
              <div className="knowledge-graph-link-controls"><select value={relationType} onChange={(event) => setRelationType(event.target.value as KnowledgeRelationType)} aria-label="관계 유형">{relationLabels.map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select><select aria-label="연결할 개념" defaultValue="" onChange={(event) => { const target = graph.entities.find((entity) => entity.id === event.target.value); if (target) void saveRelationWithEntities(target); }}><option value="">개념 연결</option>{graph.entities.filter((entity) => entity.id !== selected.id).map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></div>
            </section>
            <section><div className="knowledge-graph-section-heading"><h3>연결 문항 <span>{linkedItems.length}</span></h3>{linkedItems.length > 0 && <button type="button" className="ui-button ui-button--secondary" onClick={() => onStartReview(linkedItems)}>이 문항 복습</button>}</div><div className="knowledge-graph-questions">{linkedItems.map((item) => <button type="button" key={item.id} onClick={() => onOpenQuestion(item)}><strong>{item.questionNumber}번</strong><span>{item.questionText.slice(0, 90)}</span></button>)}{!linkedItems.length && <p className="knowledge-graph-muted">아직 연결된 문항이 없습니다.</p>}</div></section>
            {questionBankItems.length > 0 && <section><h3>문항 연결</h3><div className="knowledge-graph-question-picker">{questionBankItems.slice(0, 12).map((item) => <button type="button" key={item.id} onClick={() => void saveQuestionLinkWithEntity(item)}><Link2 size={14} />{item.questionNumber}번 · {item.entryTitle}</button>)}</div></section>}
          </> : <div className="knowledge-graph-empty-detail"><strong>개념을 선택하세요</strong><p>왼쪽 목록에서 개념을 선택하거나 새로 추가하세요.</p></div>}
        </main>
      </div>
    </section>
  );
}
