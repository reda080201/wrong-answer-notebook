import type { ListFilter, SortKey, EntryKind } from "../types";
import {
  type DifficultyFilter,
  type DifficultyScoreFilter,
  isDifficultyFilter,
  isDifficultyScoreFilter,
} from "../utils/appUi";

interface AppToolbarProps {
  activeSection: EntryKind;
  search: string;
  setSearch: (value: string) => void;
  sortKey: SortKey;
  setSortKey: (value: SortKey) => void;
  difficultyFilter: DifficultyFilter;
  setDifficultyFilter: (value: DifficultyFilter) => void;
  difficultyScoreFilter: DifficultyScoreFilter;
  setDifficultyScoreFilter: (value: DifficultyScoreFilter) => void;
  listFilter: ListFilter;
  setListFilter: (value: ListFilter) => void;
  todayReviewCount: number;
  startReview: (mode: "today" | "random" | "difficult") => void;
  onOpenSettings: () => void;
}

export default function AppToolbar({
  activeSection,
  search,
  setSearch,
  sortKey,
  setSortKey,
  difficultyFilter,
  setDifficultyFilter,
  difficultyScoreFilter,
  setDifficultyScoreFilter,
  listFilter,
  setListFilter,
  todayReviewCount,
  startReview,
  onOpenSettings,
}: AppToolbarProps) {
  const placeholder =
    activeSection === "concept"
      ? "개념명, 설명, 태그로 검색…"
      : activeSection === "lecture"
        ? "특강 제목, 개념, 내용 검색…"
        : "문제, 답, 태그로 검색…";

  return (
    <div className="toolbar">
      <input
        type="search"
        className="search-input"
        placeholder={placeholder}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <select
        className="sort-select"
        value={sortKey}
        onChange={(event) => setSortKey(event.target.value as SortKey)}
        aria-label="정렬"
      >
        <option value="date-desc">최신순</option>
        <option value="date-asc">오래된순</option>
        <option value="title-asc">제목 가나다순</option>
        <option value="title-desc">제목 역순</option>
        <option value="question-count-desc">문항 수 많은 순</option>
        <option value="bookmark-count-desc">북마크 문제 많은 순</option>
        <option value="review-need-count-desc">복습 필요 많은 순</option>
        <option value="difficulty-score-desc">난이도 높은 순</option>
        <option value="difficulty-score-asc">난이도 낮은 순</option>
        <option value="group-title-asc">묶음 이름순</option>
        <option value="part-order-asc">파트 순서순</option>
      </select>
      <div className="difficulty-filter-wrap">
        <select
          className="difficulty-filter-select"
          value={difficultyFilter}
          onChange={(event) => {
            if (isDifficultyFilter(event.target.value)) {
              setDifficultyFilter(event.target.value);
            }
          }}
          aria-label="난이도 필터"
        >
          <option value="all">모든 난이도</option>
          <option value="high">난이도: 상</option>
          <option value="medium">난이도: 중</option>
          <option value="low">난이도: 하</option>
          <option value="none">난이도: 없음</option>
        </select>
      </div>
      <div className="difficulty-filter-wrap">
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
      </div>
      <div className="filter-toggle filter-toggle--wrap">
        {(
          [
            ["all", "전체"],
            ["pending", "복습 필요"],
            ["mastered", "완료"],
            ["difficult", "어려움"],
            ["due", `오늘 ${todayReviewCount}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={listFilter === key ? "active" : ""}
            onClick={() => setListFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="review-launcher">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => startReview("today")}
        >
          오늘 복습
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => startReview("random")}
        >
          랜덤 복습
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => startReview("difficult")}
        >
          어려움 집중
        </button>
      </div>
      <button type="button" className="toolbar-settings-button" onClick={onOpenSettings}>
        ⚙ 설정
      </button>
    </div>
  );
}
