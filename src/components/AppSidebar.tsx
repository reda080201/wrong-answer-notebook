import SubjectList from "./SubjectList";
import type {
  EntryKind,
} from "../types";
import { entryKindName } from "../utils/appUi";
import { mistakeCauseLabel } from "../utils/mistakeAnalysis";

interface AppSidebarProps {
  activeSection: EntryKind;
  setActiveSection: (section: EntryKind) => void;
  setSelectedId: (id: string | null) => void;
  stats: {
    total: number;
    pending: number;
    difficult: number;
  };
  learningStats: ReturnType<
    typeof import("../utils/conceptAnalytics").buildLearningDashboardStats
  >;
  subjectOrder: string[];
  subjectFilter: string | null;
  subjectCounts: Record<string, number>;
  sectionEntryCount: number;
  moveSubject: (fromIndex: number, toIndex: number) => void;
  openNew: () => void;
  openImport: () => void;
  openLearningImport: () => void;
  onSubjectSelect: (subject: string | null) => void;
}

const sectionTabs = [
  ["wrong_answer", "📕 오답노트"],
  ["concept", "💡 개념노트"],
  ["problem_sheet", "📄 시험지함"],
  ["lecture", "🎓 특강자료"],
] as const;

export default function AppSidebar({
  activeSection,
  setActiveSection,
  setSelectedId,
  stats,
  learningStats,
  subjectOrder,
  subjectFilter,
  subjectCounts,
  sectionEntryCount,
  moveSubject,
  openNew,
  openImport,
  openLearningImport,
  onSubjectSelect,
}: AppSidebarProps) {
  return (
    <aside className="sidebar">
      <div className="logo">
        <div className="logo-icon">📓</div>
        <h1>오답노트</h1>
      </div>

      <div className="section-tabs">
        {sectionTabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`section-tab-btn ${activeSection === key ? "active" : ""}`}
            onClick={() => {
              setActiveSection(key);
              setSelectedId(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="stats">
        <div className="stat-card">
          <div className="value">{stats.total}</div>
          <div className="label">전체</div>
        </div>
        <div className="stat-card">
          <div className="value">{stats.pending}</div>
          <div className="label">복습 필요</div>
        </div>
        <div className="stat-card stat-card--compact">
          <div className="value">{stats.difficult}</div>
          <div className="label">어려움</div>
        </div>
      </div>

      <div className="learning-insights">
        <div className="learning-insight">
          <span>7일 복습</span>
          <strong>{learningStats.recentReviewCount}</strong>
        </div>
        <div className="learning-insight">
          <span>주요 원인</span>
          <strong>
            {learningStats.topCauses[0]
              ? mistakeCauseLabel(learningStats.topCauses[0].type)
              : "미분류"}
          </strong>
        </div>
        <div className="learning-insight">
          <span>약점 개념</span>
          <strong>{learningStats.weakConcepts[0]?.concept ?? "-"}</strong>
        </div>
      </div>

      <div className="filter-section">
        <h3>과목</h3>
        <SubjectList
          subjectOrder={subjectOrder}
          subjectFilter={subjectFilter}
          subjectCounts={subjectCounts}
          totalCount={sectionEntryCount}
          onSelect={onSubjectSelect}
          onReorder={moveSubject}
        />
      </div>

      <div className="sidebar-footer">
        <button type="button" className="btn-new" onClick={openNew}>
          + 새 {entryKindName(activeSection)} 추가
        </button>
        {(activeSection === "problem_sheet" || activeSection === "concept") && (
          <button
            type="button"
            className="btn-new btn-new--secondary"
            onClick={openImport}
          >
            GPT 결과 가져오기
          </button>
        )}
        {activeSection === "lecture" && (
          <button
            type="button"
            className="btn-new btn-new--secondary"
            onClick={openLearningImport}
          >
            HTML/MD/JSON 가져오기
          </button>
        )}
      </div>
    </aside>
  );
}
