import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { QuestionBankPreferences, QuestionBankSort, WrongAnswerEntry } from "../../../types";
import { buildQuestionBankItems } from "../utils/buildQuestionBankItems";
import { filterQuestionBankItems } from "../utils/filterQuestionBankItems";
import { filtersForPreferences, filtersFromPreferences, selectQuestionBankItems, sortQuestionBankItems } from "../utils/questionBankSelection";
import { DEFAULT_QUESTION_BANK_FILTERS, QUESTION_BANK_SORT_LABELS, type QuestionBankFilters, type QuestionBankItem } from "../model/questionBankTypes";
import QuestionBankCard from "./QuestionBankCard";
import QuestionBankFilterBar from "./QuestionBankFilterBar";
import QuestionBankDetail from "./QuestionBankDetail";

interface QuestionBankViewProps {
  entries: WrongAnswerEntry[];
  onOpenQuestion: (item: QuestionBankItem) => void;
  preferences?: QuestionBankPreferences;
  onPreferencesChange?: (patch: Partial<QuestionBankPreferences>) => Promise<void> | void;
  onRegisterPreferenceFlush?: (flush: (() => Promise<void>) | null) => void;
  onPatchQuestionClassification?: (entryId: string, questionNumber: string, patch: NonNullable<NonNullable<WrongAnswerEntry["questionMeta"]>[number]["classification"]>) => Promise<void> | void;
}

export default function QuestionBankView({ entries, onOpenQuestion, preferences, onPreferencesChange, onRegisterPreferenceFlush, onPatchQuestionClassification }: QuestionBankViewProps) {
  const [filters, setFilters] = useState<QuestionBankFilters>(() => filtersFromPreferences(preferences?.recentFilters));
  const [sort, setSort] = useState<QuestionBankSort>(preferences?.lastSort ?? "updated");
  const [detailItem, setDetailItem] = useState<QuestionBankItem | null>(null);
  const [picked, setPicked] = useState<QuestionBankItem[]>([]);
  const [presetName, setPresetName] = useState("");
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const preferenceTimerRef = useRef<number | null>(null);
  const pendingPreferencePatchRef = useRef<Partial<QuestionBankPreferences> | null>(null);
  const filtersRef = useRef(filters);
  const sortRef = useRef(sort);
  const items = useMemo(() => buildQuestionBankItems(entries), [entries]);
  const filtered = useMemo(() => sortQuestionBankItems(filterQuestionBankItems(items, filters), sort), [items, filters, sort]);
  useEffect(() => {
    const nextFilters = filtersFromPreferences(preferences?.recentFilters);
    const nextSort = preferences?.lastSort ?? "updated";
    setFilters((current) => JSON.stringify(filtersForPreferences(current)) === JSON.stringify(filtersForPreferences(nextFilters)) ? current : nextFilters);
    setSort((current) => current === nextSort ? current : nextSort);
  }, [preferences?.lastSort, preferences?.recentFilters]);
  useEffect(() => {
    filtersRef.current = filters;
    sortRef.current = sort;
  }, [filters, sort]);
  const flushPendingPreferences = useCallback(async () => {
    if (preferenceTimerRef.current !== null) {
      window.clearTimeout(preferenceTimerRef.current);
      preferenceTimerRef.current = null;
    }
    const next = pendingPreferencePatchRef.current;
    pendingPreferencePatchRef.current = null;
    if (!next || !onPreferencesChange) return;
    try {
      await onPreferencesChange(next);
      setPreferencesError(null);
    } catch {
      setPreferencesError("문제 은행 설정을 저장하지 못했습니다.");
      throw new Error("문제 은행 설정을 저장하지 못했습니다.");
    }
  }, [onPreferencesChange]);
  useEffect(() => {
    onRegisterPreferenceFlush?.(flushPendingPreferences);
    return () => {
      void flushPendingPreferences().catch(() => undefined);
      onRegisterPreferenceFlush?.(null);
    };
  }, [flushPendingPreferences, onRegisterPreferenceFlush]);
  const savePreferences = (patch: Partial<QuestionBankPreferences>) => {
    pendingPreferencePatchRef.current = { ...pendingPreferencePatchRef.current, ...patch };
    if (preferenceTimerRef.current !== null) window.clearTimeout(preferenceTimerRef.current);
    preferenceTimerRef.current = window.setTimeout(() => {
      void flushPendingPreferences().catch(() => undefined);
    }, 300);
  };
  const applySelection = (nextFilters: QuestionBankFilters, nextSort: QuestionBankSort) => {
    filtersRef.current = nextFilters;
    sortRef.current = nextSort;
    setFilters(nextFilters);
    setSort(nextSort);
    savePreferences({ recentFilters: filtersForPreferences(nextFilters), lastSort: nextSort });
  };
  const patchFilters = (patch: Partial<QuestionBankFilters>) => {
    const next = { ...filtersRef.current, ...patch };
    filtersRef.current = next;
    setFilters(next);
    if (Object.keys(patch).some((key) => key !== "search")) savePreferences({ recentFilters: filtersForPreferences(next), lastSort: sortRef.current });
  };
  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const preset = { id: uuidv4(), name, filters: filtersForPreferences(filtersRef.current), sort: sortRef.current };
    void Promise.resolve(onPreferencesChange?.({ savedPresets: [...(preferences?.savedPresets ?? []), preset] })).then(() => setPreferencesError(null)).catch(() => setPreferencesError("문제 은행 프리셋을 저장하지 못했습니다."));
    setPresetName("");
  };
  return <section className="question-bank-view" aria-label="문제 은행">
    <header className="question-bank-view__header"><div><h2>문제 은행</h2><p>문제지의 문항과 단일 오답을 한곳에서 찾습니다.</p></div><strong>{filtered.length} / {items.length}</strong></header>
    <div className="question-bank-actions">
      <label>정렬 <select value={sort} onChange={(event) => applySelection(filters, event.target.value as QuestionBankSort)}>{Object.entries(QUESTION_BANK_SORT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>프리셋 이름 <input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="필터 이름" /></label><button type="button" className="btn-secondary" disabled={!presetName.trim()} onClick={savePreset}>현재 필터 저장</button>
      {(preferences?.savedPresets ?? []).map((preset) => <button type="button" key={preset.id} className="btn-secondary" onClick={() => applySelection(filtersFromPreferences(preset.filters), preset.sort)}>{preset.name}</button>)}
      <button type="button" className="btn-primary" disabled={!filtered.length} onClick={() => { const selected = selectQuestionBankItems(filtered, 1, `${Date.now()}`); if (selected[0]) onOpenQuestion(selected[0]); }}>한 문제 풀기</button>
      <button type="button" className="btn-secondary" disabled={!filtered.length} onClick={() => setPicked(selectQuestionBankItems(filtered, Math.min(10, filtered.length), `${Date.now()}`))}>10개 추출</button>
    </div>
    {preferencesError && <p className="form-hint" role="alert">{preferencesError}<button type="button" className="btn-secondary" onClick={() => savePreferences({ recentFilters: filtersForPreferences(filters), lastSort: sort })}>다시 저장</button></p>}
    <QuestionBankFilterBar items={items} filters={filters} onChange={patchFilters} onReset={() => applySelection(DEFAULT_QUESTION_BANK_FILTERS, sort)} />
    {picked.length > 0 && <div className="question-bank-picked" role="status">추출된 문항 {picked.map((item) => `${item.entryTitle} ${item.questionNumber}번`).join(" · ")}</div>}
    {filtered.length ? <div className="question-bank-list">{filtered.map((item) => <QuestionBankCard key={item.id} item={item} onOpen={onOpenQuestion} onInspect={setDetailItem} />)}</div> : <div className="detail-panel empty-state"><p>조건에 맞는 문항이 없습니다.</p><button type="button" className="btn-secondary" onClick={() => applySelection(DEFAULT_QUESTION_BANK_FILTERS, sort)}>필터 초기화</button></div>}
    <QuestionBankDetail item={detailItem} onClose={() => setDetailItem(null)} onOpenQuestion={onOpenQuestion} onPatchClassification={onPatchQuestionClassification} />
  </section>;
}
