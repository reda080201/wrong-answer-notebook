import { useEffect, useMemo, useRef, useState } from "react";
import type { LearningBlock, LearningImportance, LearningReviewStatus, LearningSubjectDomain, WrongAnswerEntry } from "../../../types";
import MathText from "../../../components/MathText";
import SubjectLearningDetails from "./SubjectLearningDetails";
import { DEFAULT_LEARNING_HUB_FILTERS, filterLearningBlocks, learningHubThinkers, learningHubUnits, projectLearningBlocks, type LearningHubFilters, type LearningHubItem } from "../utils/learningHub";
import type { QuestionBankItem } from "../../question-bank/model/questionBankTypes";
import SimilarQuestionLinksPanel from "../../question-bank/components/SimilarQuestionLinksPanel";

const DOMAIN_LABELS: Record<LearningSubjectDomain | "all", string> = {
  all: "모든 과목",
  math: "수학",
  language_media: "언어와 매체",
  social_culture: "사회·문화",
  life_ethics: "생활과 윤리",
  general: "일반",
};

const TYPE_LABELS: Record<LearningBlock["type"] | "all", string> = {
  all: "모든 자료",
  concept: "핵심 개념",
  formula: "공식 또는 원칙",
  routine: "풀이법",
  warning: "자주 하는 실수",
  review: "복습 체크",
  checklist: "꼭 알아야 할 내용",
  diagram: "대표 예시",
};

const IMPORTANCE_LABELS: Record<LearningImportance | "all", string> = { all: "모든 중요도", essential: "필수", recommended: "권장", reference: "참고" };
const REVIEW_LABELS: Record<LearningReviewStatus | "all", string> = { all: "모든 검토 상태", draft: "초안", needs_review: "검토 필요", reviewed: "검토 완료" };

interface LearningHubViewProps {
  entries: WrongAnswerEntry[];
  onOpenSource: (entryId: string, questionNumber?: string) => void;
  onUpdateBlock: (entryId: string, blockId: string, patch: Partial<LearningBlock>) => Promise<void>;
  onDuplicateBlock: (entryId: string, blockId: string) => Promise<void>;
  onDeleteBlock: (entryId: string, blockId: string) => Promise<void>;
  onOpenCandidateReview: (entryId: string) => void;
  questionBankItems?: QuestionBankItem[];
  highlightedBlock?: { entryId: string; blockId: string } | null;
}

function BlockEditor({ item, onSave, onCancel }: { item: LearningHubItem; onSave: (patch: Partial<LearningBlock>) => Promise<boolean>; onCancel: () => void }) {
  const [title, setTitle] = useState(item.block.title);
  const [content, setContent] = useState(item.block.content);
  const [unit, setUnit] = useState(item.block.unit ?? "");
  const [keywords, setKeywords] = useState((item.block.keywords ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  return <form className="learning-hub-editor" onSubmit={(event) => {
    event.preventDefault();
    setSaving(true);
    void onSave({ title: title.trim(), content: content.trim(), unit: unit.trim() || undefined, keywords: keywords.split(",").map((value) => value.trim()).filter(Boolean) }).finally(() => setSaving(false));
  }}>
    <label>제목<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
    <label>단원<input value={unit} onChange={(event) => setUnit(event.target.value)} /></label>
    <label>키워드<input value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="쉼표로 구분" /></label>
    <label>핵심 내용<textarea value={content} onChange={(event) => setContent(event.target.value)} rows={5} /></label>
    <div className="learning-hub-actions"><button type="submit" disabled={saving}>저장</button><button type="button" onClick={onCancel} disabled={saving}>취소</button></div>
  </form>;
}

function LearningBlockCard({ item, onOpenSource, onUpdateBlock, onDuplicateBlock, onDeleteBlock, questionBankItems = [], highlighted }: { item: LearningHubItem; highlighted?: boolean } & Pick<LearningHubViewProps, "onOpenSource" | "onUpdateBlock" | "onDuplicateBlock" | "onDeleteBlock" | "questionBankItems">) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const failedTaskRef = useRef<(() => Promise<void>) | null>(null);
  const { block } = item;
  const sourceQuestion = block.sourceQuestionNumber ?? block.sourceReferences?.find((reference) => reference.questionNumber)?.questionNumber;
  const mutate = async (task: () => Promise<void>) => {
    if (busy) return false;
    setBusy(true);
    setActionError(null);
    try {
      await task();
      failedTaskRef.current = null;
      return true;
    } catch (error) {
      failedTaskRef.current = task;
      setActionError(error instanceof Error ? error.message : "학습 카드를 저장하지 못했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const retry = () => {
    const failedTask = failedTaskRef.current;
    if (failedTask) void mutate(failedTask);
  };
  return <article id={`learning-block-${item.sourceEntryId}-${block.id}`} className={`learning-hub-card${highlighted ? " learning-hub-card--highlighted" : ""}`} aria-busy={busy || undefined}>
    <header>
      <div><span className="learning-hub-chip">{DOMAIN_LABELS[item.domain]}</span><span className="learning-hub-chip">{TYPE_LABELS[block.type]}</span><span className="learning-hub-chip">{IMPORTANCE_LABELS[block.importance ?? "reference"]}</span></div>
      <div className="learning-hub-menu" aria-label={`${block.title || "학습 카드"} 작업`}>
        <button type="button" onClick={() => setEditing((value) => !value)} disabled={busy}>수정</button>
        <button type="button" onClick={() => void mutate(() => onUpdateBlock(item.sourceEntryId, block.id, { reviewStatus: "reviewed" }))} disabled={busy || block.reviewStatus === "reviewed"}>검토 완료</button>
        <button type="button" onClick={() => void mutate(() => onDuplicateBlock(item.sourceEntryId, block.id))} disabled={busy}>복제</button>
        <button type="button" onClick={() => void mutate(() => onDeleteBlock(item.sourceEntryId, block.id))} disabled={busy}>삭제</button>
      </div>
    </header>
    <h3>{block.title || "학습 내용"}</h3>
    <p className="learning-hub-meta">{item.sourceSubject} · {block.unit ?? "단원 미분류"} · {REVIEW_LABELS[block.reviewStatus ?? "draft"]} · {new Date(item.sourceEntry.updatedAt).toLocaleDateString("ko-KR")}</p>
    {actionError && <div className="form-error" role="alert">{actionError}<button type="button" className="btn-secondary" onClick={retry} disabled={busy}>다시 저장</button></div>}
    {editing ? <BlockEditor item={item} onSave={async (patch) => {
      const saved = await mutate(() => onUpdateBlock(item.sourceEntryId, block.id, patch));
      if (saved) setEditing(false);
      return saved;
    }} onCancel={() => setEditing(false)} /> : <>
      {block.content && <div className="learning-hub-content"><MathText text={block.content} /></div>}
      <SubjectLearningDetails block={block} />
      {block.commonTraps?.length ? <section className="learning-hub-warning"><h4>함정 또는 오개념</h4><ul>{block.commonTraps.map((trap) => <li key={trap}>{trap}</li>)}</ul></section> : null}
      {block.relatedConcepts?.length ? <p className="learning-hub-related">관련 개념: {block.relatedConcepts.join(" · ")}</p> : null}
      {block.passageExamples?.map((example) => <section className="learning-hub-example" key={example.id}><h4>{example.isSynthetic ? "합성 지문 예시" : "지문 예시"}</h4><p>{example.text}</p>{example.explanation && <small>{example.explanation}</small>}</section>)}
      {block.choiceExamples?.map((example) => <section className="learning-hub-example" key={example.id}><h4>{example.isSynthetic ? "합성 선지 예시" : "선지 예시"}{example.verdict ? ` · ${example.verdict === "correct" ? "옳음" : example.verdict === "incorrect" ? "틀림" : "조건부"}` : ""}</h4><p>{example.text}</p>{example.reason && <small>{example.reason}</small>}</section>)}
      <footer><button type="button" onClick={() => onOpenSource(item.sourceEntryId, sourceQuestion)}>연결 문제 열기</button><span>{item.sourceEntryTitle}</span></footer>
      <SimilarQuestionLinksPanel sourceEntry={item.sourceEntry} block={block} links={block.similarQuestionLinks ?? []} items={questionBankItems} onOpen={onOpenSource} onChange={(links) => onUpdateBlock(item.sourceEntryId, block.id, { similarQuestionLinks: links })} label="이 학습 카드의 관련 문제" />
    </>}
  </article>;
}

export default function LearningHubView({ entries, onOpenSource, onUpdateBlock, onDuplicateBlock, onDeleteBlock, onOpenCandidateReview, questionBankItems = [], highlightedBlock = null }: LearningHubViewProps) {
  const [filters, setFilters] = useState<LearningHubFilters>(DEFAULT_LEARNING_HUB_FILTERS);
  const items = useMemo(() => projectLearningBlocks(entries), [entries]);
  const filtered = useMemo(() => filterLearningBlocks(items, filters), [items, filters]);
  const units = useMemo(() => learningHubUnits(items), [items]);
  const thinkers = useMemo(() => learningHubThinkers(items), [items]);
  useEffect(() => {
    if (!highlightedBlock) return;
    document.getElementById(`learning-block-${highlightedBlock.entryId}-${highlightedBlock.blockId}`)?.scrollIntoView({ block: "center" });
  }, [highlightedBlock]);
  const set = <K extends keyof LearningHubFilters>(key: K, value: LearningHubFilters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const activeFilterChips = [
    filters.search ? { key: "search", label: `검색: ${filters.search}`, clear: () => set("search", "") } : null,
    filters.domain !== "all" ? { key: "domain", label: DOMAIN_LABELS[filters.domain], clear: () => set("domain", "all") } : null,
    filters.unit !== "all" ? { key: "unit", label: filters.unit, clear: () => set("unit", "all") } : null,
    filters.type !== "all" ? { key: "type", label: TYPE_LABELS[filters.type], clear: () => set("type", "all") } : null,
    filters.importance !== "all" ? { key: "importance", label: IMPORTANCE_LABELS[filters.importance], clear: () => set("importance", "all") } : null,
    filters.reviewStatus !== "all" ? { key: "reviewStatus", label: REVIEW_LABELS[filters.reviewStatus], clear: () => set("reviewStatus", "all") } : null,
    filters.linkedOnly ? { key: "linkedOnly", label: "연결 문항", clear: () => set("linkedOnly", false) } : null,
    ...filters.thinkers.map((thinker) => ({ key: `thinker:${thinker}`, label: thinker, clear: () => set("thinkers", filters.thinkers.filter((value) => value !== thinker)) })),
    ...filters.lifeEthicsKinds.map((kind) => ({ key: `lifeEthics:${kind}`, label: kind === "passage_clue" ? "지문 단서" : "틀린 선지", clear: () => set("lifeEthicsKinds", filters.lifeEthicsKinds.filter((value) => value !== kind)) })),
  ].filter((chip): chip is { key: string; label: string; clear: () => void } => chip !== null);
  const candidateEntries = useMemo(
    () => entries.filter((entry) => (entry.answerKey?.length ?? 0) > 0),
    [entries],
  );
  return <section className="learning-hub" aria-label="학습 허브">
    <header className="learning-hub-heading"><div><span>Learning hub</span><h2>과목별 학습 지식 허브</h2><p>저장된 개념, 공식, 풀이법과 복습 포인트를 한곳에서 찾습니다.</p><div className="learning-hub-source-actions">{candidateEntries.map((entry) => <button key={entry.id} type="button" onClick={() => onOpenCandidateReview(entry.id)}>답안에서 학습 후보 만들기 · {entry.title}</button>)}</div></div><strong>{filtered.length}개</strong></header>
    <div className="learning-hub-filters">
      <input aria-label="학습 내용 검색" value={filters.search} onChange={(event) => set("search", event.target.value)} placeholder="제목, 개념, 공식, 예시 검색" />
      <select aria-label="과목 필터" value={filters.domain} onChange={(event) => set("domain", event.target.value as LearningHubFilters["domain"])}>{Object.entries(DOMAIN_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label="단원 필터" value={filters.unit} onChange={(event) => set("unit", event.target.value)}><option value="all">모든 단원</option>{units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select>
      <select aria-label="자료 종류 필터" value={filters.type} onChange={(event) => set("type", event.target.value as LearningHubFilters["type"])}>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label="중요도 필터" value={filters.importance} onChange={(event) => set("importance", event.target.value as LearningHubFilters["importance"])}>{Object.entries(IMPORTANCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label="검토 상태 필터" value={filters.reviewStatus} onChange={(event) => set("reviewStatus", event.target.value as LearningHubFilters["reviewStatus"])}>{Object.entries(REVIEW_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <label className="learning-hub-linked"><input type="checkbox" checked={filters.linkedOnly} onChange={(event) => set("linkedOnly", event.target.checked)} /> 연결 문항만</label>
      {filters.domain === "life_ethics" && <><div className="learning-hub-thinker-filter" aria-label="사상가 필터">{thinkers.map((thinker) => <button key={thinker} type="button" className={filters.thinkers.includes(thinker) ? "active" : ""} onClick={() => set("thinkers", filters.thinkers.includes(thinker) ? filters.thinkers.filter((value) => value !== thinker) : [...filters.thinkers, thinker])}>{thinker}</button>)}</div><div className="learning-hub-thinker-filter" aria-label="생활과 윤리 자료 유형 필터">{(["passage_clue", "incorrect_choice"] as const).map((kind) => <button key={kind} type="button" className={filters.lifeEthicsKinds.includes(kind) ? "active" : ""} onClick={() => set("lifeEthicsKinds", filters.lifeEthicsKinds.includes(kind) ? filters.lifeEthicsKinds.filter((value) => value !== kind) : [...filters.lifeEthicsKinds, kind])}>{kind === "passage_clue" ? "지문 단서" : "틀린 선지"}</button>)}</div></>}
      <button type="button" onClick={() => setFilters(DEFAULT_LEARNING_HUB_FILTERS)}>필터 초기화</button>
    </div>
    <div className="learning-hub-active-filters">{activeFilterChips.map((chip) => <button key={chip.key} type="button" className="learning-hub-chip" onClick={chip.clear} aria-label={`${chip.label} 필터 제거`}>{chip.label} ×</button>)}</div>
    {filtered.length ? <div className="learning-hub-grid">{filtered.map((item) => <LearningBlockCard key={`${item.sourceEntryId}:${item.block.id}`} item={item} highlighted={highlightedBlock?.entryId === item.sourceEntryId && highlightedBlock.blockId === item.block.id} onOpenSource={onOpenSource} onUpdateBlock={onUpdateBlock} onDuplicateBlock={onDuplicateBlock} onDeleteBlock={onDeleteBlock} questionBankItems={questionBankItems} />)}</div> : <div className="detail-panel empty-state"><p>조건에 맞는 학습 카드가 없습니다.</p></div>}
  </section>;
}
