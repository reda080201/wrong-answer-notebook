import { useState } from "react";
import type { ListFilter, SortKey, EntryKind } from "../types";
import Menu from "../shared/ui/Menu";
import Dialog from "../shared/ui/Dialog";
import {
  type DifficultyFilter,
  type DifficultyScoreFilter,
  getListFilterOptionsForSection,
  getSortOptionsForSection,
  isDifficultyScoreFilterVisibleForSection,
  isDifficultyScoreFilter,
} from "../utils/appUi";
import SearchField from "../shared/ui/SearchField";

interface AppToolbarProps {
  activeSection: EntryKind;
  search: string;
  setSearch: (value: string) => void;
  sortKey: SortKey;
  setSortKey: (value: SortKey) => void;
  /** Compatibility-only: legacy categorical difficulty no longer affects filtering. */
  difficultyFilter?: DifficultyFilter;
  setDifficultyFilter?: (value: DifficultyFilter) => void;
  difficultyScoreFilter: DifficultyScoreFilter;
  setDifficultyScoreFilter: (value: DifficultyScoreFilter) => void;
  listFilter: ListFilter;
  setListFilter: (value: ListFilter) => void;
  todayReviewCount: number;
  startReview: (mode: "today" | "random" | "difficult" | "important") => void;
  onOpenSettings: () => void;
}

export default function AppToolbar({
  activeSection,
  search,
  setSearch,
  sortKey,
  setSortKey,
  difficultyScoreFilter,
  setDifficultyScoreFilter,
  listFilter,
  setListFilter,
  todayReviewCount,
  startReview,
  onOpenSettings,
}: AppToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const sortOptions = getSortOptionsForSection(activeSection);
  const listFilterOptions = getListFilterOptionsForSection(activeSection);
  const showDifficultyScoreFilter = isDifficultyScoreFilterVisibleForSection(activeSection);
  const showReviewLauncher = activeSection === "wrong_answer" || activeSection === "problem_sheet";
  const placeholder =
    activeSection === "concept"
      ? "개념명, 설명, 태그로 검색…"
      : activeSection === "lecture"
        ? "특강 제목, 개념, 내용 검색…"
        : "문제, 답, 태그로 검색…";
  const activeChips = [
    sortKey !== sortOptions[0]?.value ? { key: "sort", label: `정렬: ${sortOptions.find((item) => item.value === sortKey)?.label ?? sortKey}`, clear: () => setSortKey(sortOptions[0]?.value ?? sortKey) } : null,
    showDifficultyScoreFilter && difficultyScoreFilter !== "all" ? { key: "difficulty", label: `난이도: ${difficultyScoreFilter}`, clear: () => setDifficultyScoreFilter("all") } : null,
    listFilter !== "all" ? { key: "status", label: listFilterOptions.find((item) => item.value === listFilter)?.label ?? listFilter, clear: () => setListFilter("all") } : null,
  ].filter((chip): chip is { key: string; label: string; clear: () => void } => chip !== null);

  return (
    <div className="toolbar">
      <SearchField className="search-input" value={search} onChange={setSearch} placeholder={placeholder} ariaLabel="자료 검색" />
      <button type="button" className="toolbar-filter-button" aria-expanded={filterOpen} onClick={() => setFilterOpen(true)}>필터{activeChips.length ? ` ${activeChips.length}` : ""}</button>
      {showReviewLauncher && <Menu label="복습" triggerAriaLabel="복습 메뉴" className="review-launcher">
        <button type="button" onClick={() => startReview("today")}>오늘 복습</button>
        <button type="button" onClick={() => startReview(activeSection === "problem_sheet" ? "important" : "random")}>
          {activeSection === "problem_sheet" ? "중요 문제 복습" : "랜덤 복습"}
        </button>
        <button type="button" onClick={() => startReview("difficult")}>
          {activeSection === "problem_sheet" ? "어려운 문항 복습" : "어려움 집중"}
        </button>
      </Menu>}
      <button type="button" className="toolbar-settings-button btn-icon" aria-label="설정" title="설정" onClick={onOpenSettings}>
        ⚙
      </button>
      {activeChips.length > 0 && <div className="toolbar-active-chips" aria-label="적용된 필터">{activeChips.map((chip) => <button key={chip.key} type="button" onClick={chip.clear} aria-label={`${chip.label} 제거`}>{chip.label} ×</button>)}</div>}
      {filterOpen && <Dialog open size="sm" ariaLabel="자료 필터" title="자료 필터" onClose={() => setFilterOpen(false)} footer={<div className="modal-actions"><button type="button" className="btn-secondary" onClick={() => { setSortKey(sortOptions[0]?.value ?? sortKey); setDifficultyScoreFilter("all"); setListFilter("all"); }}>초기화</button><button type="button" className="btn-primary" onClick={() => setFilterOpen(false)}>적용</button></div>}>
        <div className="toolbar-filter-panel">
          <label>정렬<select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} aria-label="정렬">{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          {showDifficultyScoreFilter && <label>난이도<select value={difficultyScoreFilter} onChange={(event) => { if (isDifficultyScoreFilter(event.target.value)) setDifficultyScoreFilter(event.target.value); }} aria-label="난이도 점수 필터"><option value="all">모든 점수</option><option value="easy">쉬움 1~30</option><option value="normal">보통 31~60</option><option value="hard">어려움 61~85</option><option value="very-hard">매우 어려움 86~100</option></select></label>}
          <fieldset><legend>상태</legend><div className="filter-toggle filter-toggle--wrap">{listFilterOptions.map(({ value, label }) => <button key={value} type="button" className={listFilter === value ? "active" : ""} onClick={() => setListFilter(value)} aria-pressed={listFilter === value}>{value === "due" ? `${label} ${todayReviewCount}` : label}</button>)}</div></fieldset>
        </div>
      </Dialog>}
    </div>
  );
}
