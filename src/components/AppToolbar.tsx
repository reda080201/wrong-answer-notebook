import type { ListFilter, SortKey, EntryKind } from "../types";
import Menu from "../shared/ui/Menu";
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

  return (
    <div className="toolbar">
      <SearchField className="search-input" value={search} onChange={setSearch} placeholder={placeholder} ariaLabel="자료 검색" />
      <select
        className="sort-select"
        value={sortKey}
        onChange={(event) => setSortKey(event.target.value as SortKey)}
        aria-label="정렬"
      >
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {showDifficultyScoreFilter && <div className="difficulty-filter-wrap">
        <select
          className="difficulty-filter-select"
          value={difficultyScoreFilter}
          onChange={(event) => {
            if (isDifficultyScoreFilter(event.target.value)) {
              setDifficultyScoreFilter(event.target.value);
            }
          }}
          aria-label="난이도 점수 필터"
        >
          <option value="all">모든 점수</option>
          <option value="easy">쉬움 1~30</option>
          <option value="normal">보통 31~60</option>
          <option value="hard">어려움 61~85</option>
          <option value="very-hard">매우 어려움 86~100</option>
        </select>
      </div>}
      <div className="filter-toggle filter-toggle--wrap">
        {listFilterOptions.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={listFilter === value ? "active" : ""}
            onClick={() => setListFilter(value)}
          >
            {value === "due" ? `${label} ${todayReviewCount}` : label}
          </button>
        ))}
      </div>
      {showReviewLauncher && <Menu label="복습" triggerAriaLabel="복습 메뉴" className="review-launcher">
        <button type="button" onClick={() => startReview("today")}>오늘 복습</button>
        <button type="button" onClick={() => startReview(activeSection === "problem_sheet" ? "important" : "random")}>
          {activeSection === "problem_sheet" ? "중요 문제 복습" : "랜덤 복습"}
        </button>
        <button type="button" onClick={() => startReview("difficult")}>
          {activeSection === "problem_sheet" ? "어려운 문항 복습" : "어려움 집중"}
        </button>
      </Menu>}
      <button type="button" className="toolbar-settings-button" onClick={onOpenSettings}>
        ⚙ 설정
      </button>
    </div>
  );
}
