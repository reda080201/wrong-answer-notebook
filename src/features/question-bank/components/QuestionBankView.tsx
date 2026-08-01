import { useMemo, useState } from "react";
import type { WrongAnswerEntry } from "../../../types";
import { buildQuestionBankItems } from "../utils/buildQuestionBankItems";
import { filterQuestionBankItems } from "../utils/filterQuestionBankItems";
import { DEFAULT_QUESTION_BANK_FILTERS, type QuestionBankFilters, type QuestionBankItem } from "../model/questionBankTypes";
import QuestionBankCard from "./QuestionBankCard";
import QuestionBankFilterBar from "./QuestionBankFilterBar";
import QuestionBankDetail from "./QuestionBankDetail";

interface QuestionBankViewProps {
  entries: WrongAnswerEntry[];
  onOpenQuestion: (item: QuestionBankItem) => void;
}

export default function QuestionBankView({ entries, onOpenQuestion }: QuestionBankViewProps) {
  const [filters, setFilters] = useState<QuestionBankFilters>(DEFAULT_QUESTION_BANK_FILTERS);
  const [detailItem, setDetailItem] = useState<QuestionBankItem | null>(null);
  const items = useMemo(() => buildQuestionBankItems(entries), [entries]);
  const filtered = useMemo(() => filterQuestionBankItems(items, filters), [items, filters]);
  const patchFilters = (patch: Partial<QuestionBankFilters>) => setFilters((current) => ({ ...current, ...patch }));
  return <section className="question-bank-view" aria-label="문제 은행">
    <header className="question-bank-view__header"><div><h2>문제 은행</h2><p>문제지의 문항과 단일 오답을 한곳에서 찾습니다.</p></div><strong>{filtered.length} / {items.length}</strong></header>
    <QuestionBankFilterBar items={items} filters={filters} onChange={patchFilters} onReset={() => setFilters(DEFAULT_QUESTION_BANK_FILTERS)} />
    {filtered.length ? <div className="question-bank-list">{filtered.map((item) => <QuestionBankCard key={item.id} item={item} onOpen={onOpenQuestion} onInspect={setDetailItem} />)}</div> : <div className="detail-panel empty-state"><p>조건에 맞는 문항이 없습니다.</p><button type="button" className="btn-secondary" onClick={() => setFilters(DEFAULT_QUESTION_BANK_FILTERS)}>필터 초기화</button></div>}
    <QuestionBankDetail item={detailItem} onClose={() => setDetailItem(null)} onOpenQuestion={onOpenQuestion} />
  </section>;
}
