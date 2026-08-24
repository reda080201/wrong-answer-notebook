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
import type { QuestionMetaPatch } from "../utils/patchQuestionClassification";
import type { TransientWriteRegistration } from "../../../hooks/useAppWriteRegistrations";
import Dialog from "../../../shared/ui/Dialog";

interface QuestionBankViewProps {
  entries: WrongAnswerEntry[];
  onOpenQuestion: (item: QuestionBankItem) => void;
  preferences?: QuestionBankPreferences;
  onPreferencesChange?: (patch: Partial<QuestionBankPreferences>) => Promise<void> | void;
  onRegisterPreferenceFlush?: (registration: TransientWriteRegistration) => void;
  onPatchQuestionClassification?: (entryId: string, questionNumber: string, patch: QuestionMetaPatch) => Promise<void> | void;
}

export default function QuestionBankView({ entries, onOpenQuestion, preferences, onPreferencesChange, onRegisterPreferenceFlush, onPatchQuestionClassification }: QuestionBankViewProps) {
  const [filters, setFilters] = useState<QuestionBankFilters>(() => filtersFromPreferences(preferences?.recentFilters));
  const [sort, setSort] = useState<QuestionBankSort>(preferences?.lastSort ?? "updated");
  const [detailItem, setDetailItem] = useState<QuestionBankItem | null>(null);
  const [picked, setPicked] = useState<QuestionBankItem[]>([]);
  const [presetName, setPresetName] = useState("");
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [maintenanceBlocked, setMaintenanceBlocked] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [narrowViewport, setNarrowViewport] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(max-width: 900px)").matches === true);
  const preferenceTimerRef = useRef<number | null>(null);
  const pendingPreferencePatchRef = useRef<Partial<QuestionBankPreferences> | null>(null);
  const failedPreferencePatchRef = useRef<Partial<QuestionBankPreferences> | null>(null);
  const preferenceRevisionRef = useRef(0);
  const filtersRef = useRef(filters);
  const sortRef = useRef(sort);
  const savedPresetsRef = useRef(preferences?.savedPresets ?? []);
  const maintenanceBlockedRef = useRef(false);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const query = window.matchMedia("(max-width: 900px)");
    const update = () => setNarrowViewport(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const updateMaintenanceBlocked = useCallback((blocked: boolean) => {
    maintenanceBlockedRef.current = blocked;
    setMaintenanceBlocked(blocked);
  }, []);
  const items = useMemo(() => buildQuestionBankItems(entries), [entries]);
  const filtered = useMemo(() => sortQuestionBankItems(filterQuestionBankItems(items, filters), sort), [items, filters, sort]);
  useEffect(() => {
    const nextFilters = filtersFromPreferences(preferences?.recentFilters);
    const nextSort = preferences?.lastSort ?? "updated";
    const nextPresets = preferences?.savedPresets ?? [];
    if (JSON.stringify(savedPresetsRef.current) !== JSON.stringify(nextPresets)) {
      savedPresetsRef.current = nextPresets;
    }
    setFilters((current) => JSON.stringify(filtersForPreferences(current)) === JSON.stringify(filtersForPreferences(nextFilters)) ? current : nextFilters);
    setSort((current) => current === nextSort ? current : nextSort);
  }, [preferences?.lastSort, preferences?.recentFilters, preferences?.savedPresets]);
  useEffect(() => {
    filtersRef.current = filters;
    sortRef.current = sort;
  }, [filters, sort]);
  const flushPendingPreferences = useCallback(async () => {
    if (preferenceTimerRef.current !== null) {
      window.clearTimeout(preferenceTimerRef.current);
      preferenceTimerRef.current = null;
    }
    const next = pendingPreferencePatchRef.current ?? failedPreferencePatchRef.current;
    pendingPreferencePatchRef.current = null;
    if (!next || !onPreferencesChange) return;
    const revision = ++preferenceRevisionRef.current;
    try {
      await onPreferencesChange(next);
      if (revision === preferenceRevisionRef.current) {
        failedPreferencePatchRef.current = null;
        setPreferencesError(null);
      }
    } catch {
      failedPreferencePatchRef.current = { ...failedPreferencePatchRef.current, ...next };
      if (revision === preferenceRevisionRef.current) setPreferencesError("문제 은행 설정을 저장하지 못했습니다.");
      throw new Error("문제 은행 설정을 저장하지 못했습니다.");
    }
  }, [onPreferencesChange]);
  useEffect(() => {
    onRegisterPreferenceFlush?.({ flush: flushPendingPreferences, setMaintenanceBlocked: updateMaintenanceBlocked });
    return () => {
      void flushPendingPreferences().catch(() => undefined);
      onRegisterPreferenceFlush?.(null);
    };
  }, [flushPendingPreferences, onRegisterPreferenceFlush, updateMaintenanceBlocked]);
  const savePreferences = (patch: Partial<QuestionBankPreferences>) => {
    if (maintenanceBlockedRef.current) {
      setPreferencesError("백업 또는 복원 중에는 문제 은행 설정을 변경할 수 없습니다.");
      return;
    }
    pendingPreferencePatchRef.current = { ...pendingPreferencePatchRef.current, ...patch };
    if (preferenceTimerRef.current !== null) window.clearTimeout(preferenceTimerRef.current);
    preferenceTimerRef.current = window.setTimeout(() => {
      void flushPendingPreferences().catch(() => undefined);
    }, 300);
  };
  const applySelection = (nextFilters: QuestionBankFilters, nextSort: QuestionBankSort) => {
    if (maintenanceBlockedRef.current) {
      setPreferencesError("백업 또는 복원 중에는 문제 은행 설정을 변경할 수 없습니다.");
      return;
    }
    filtersRef.current = nextFilters;
    sortRef.current = nextSort;
    setFilters(nextFilters);
    setSort(nextSort);
    savePreferences({ recentFilters: filtersForPreferences(nextFilters), lastSort: nextSort });
  };
  const patchFilters = (patch: Partial<QuestionBankFilters>) => {
    const persists = Object.keys(patch).some((key) => key !== "search");
    if (persists && maintenanceBlockedRef.current) {
      setPreferencesError("백업 또는 복원 중에는 문제 은행 설정을 변경할 수 없습니다.");
      return;
    }
    const next = { ...filtersRef.current, ...patch };
    filtersRef.current = next;
    setFilters(next);
    if (persists) savePreferences({ recentFilters: filtersForPreferences(next), lastSort: sortRef.current });
  };
  const savePreset = () => {
    if (maintenanceBlockedRef.current) {
      setPreferencesError("백업 또는 복원 중에는 문제 은행 설정을 변경할 수 없습니다.");
      return;
    }
    const name = presetName.trim();
    if (!name) return;
    const preset = { id: uuidv4(), name, filters: filtersForPreferences(filtersRef.current), sort: sortRef.current };
    const savedPresets = [...savedPresetsRef.current, preset];
    savedPresetsRef.current = savedPresets;
    savePreferences({ savedPresets });
    setPresetName("");
  };
  return <section className="question-bank-view" aria-label="문제 은행">
    <header className="question-bank-view__header"><div><h2>문제 은행</h2><p>문제지의 문항과 단일 오답을 한곳에서 찾습니다.</p></div><strong>{filtered.length} / {items.length}</strong></header>
    <div className="question-bank-actions">
      <label className="question-bank-search">검색 <input type="search" value={filters.search} onChange={(event) => patchFilters({ search: event.target.value })} placeholder="문제 본문·자료명 검색" /></label>
      <label>정렬 <select value={sort} disabled={maintenanceBlocked} onChange={(event) => applySelection(filters, event.target.value as QuestionBankSort)}>{Object.entries(QUESTION_BANK_SORT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button type="button" className="btn-secondary" onClick={() => setFiltersOpen(true)}>필터</button>
      <button type="button" className="btn-primary" disabled={!filtered.length} onClick={() => { const selected = selectQuestionBankItems(filtered, 1, `${Date.now()}`); if (selected[0]) onOpenQuestion(selected[0]); }}>한 문제 풀기</button>
    </div>
    {maintenanceBlocked && <p className="form-hint" role="status">백업 또는 복원 중에는 저장되는 문제 은행 설정을 변경할 수 없습니다.</p>}
    {preferencesError && <p className="form-hint" role="alert">{preferencesError}{!maintenanceBlocked && <button type="button" className="btn-secondary" onClick={() => {
      const failed = failedPreferencePatchRef.current;
      if (failed) {
        failedPreferencePatchRef.current = null;
        savePreferences({ ...failed, ...pendingPreferencePatchRef.current });
      }
    }}>다시 저장</button>}</p>}
    {filtersOpen && <Dialog open size="lg" ariaLabel="문제 은행 필터" onClose={() => setFiltersOpen(false)}><header className="modal-head"><h2>문제 필터</h2></header><QuestionBankFilterBar items={items} filters={filters} onChange={patchFilters} onReset={() => applySelection(DEFAULT_QUESTION_BANK_FILTERS, sort)} disabled={maintenanceBlocked} /><details className="question-bank-presets"><summary>프리셋과 일괄 추출</summary><label>프리셋 이름 <input value={presetName} disabled={maintenanceBlocked} onChange={(event) => setPresetName(event.target.value)} placeholder="필터 이름" /></label><button type="button" className="btn-secondary" disabled={maintenanceBlocked || !presetName.trim()} onClick={savePreset}>현재 필터 저장</button>{(preferences?.savedPresets ?? []).map((preset) => <button type="button" key={preset.id} className="btn-secondary" disabled={maintenanceBlocked} onClick={() => applySelection(filtersFromPreferences(preset.filters), preset.sort)}>{preset.name}</button>)}<button type="button" className="btn-secondary" disabled={!filtered.length} onClick={() => setPicked(selectQuestionBankItems(filtered, Math.min(10, filtered.length), `${Date.now()}`))}>10개 추출</button></details></Dialog>}
    {picked.length > 0 && <div className="question-bank-picked" role="status">추출된 문항 {picked.map((item) => `${item.entryTitle} ${item.questionNumber}번`).join(" · ")}</div>}
    {filtered.length ? <div className="question-bank-workspace"><div className="question-bank-list">{filtered.map((item) => <QuestionBankCard key={item.id} item={item} onOpen={onOpenQuestion} onInspect={setDetailItem} />)}</div>{!narrowViewport && <QuestionBankDetail inline item={detailItem} onClose={() => setDetailItem(null)} onOpenQuestion={onOpenQuestion} onPatchClassification={onPatchQuestionClassification} />}</div> : <div className="detail-panel empty-state"><p>조건에 맞는 문항이 없습니다.</p><button type="button" className="btn-secondary" onClick={() => applySelection(DEFAULT_QUESTION_BANK_FILTERS, sort)}>필터 초기화</button></div>}
    {narrowViewport && <QuestionBankDetail item={detailItem} onClose={() => setDetailItem(null)} onOpenQuestion={onOpenQuestion} onPatchClassification={onPatchQuestionClassification} />}
  </section>;
}
