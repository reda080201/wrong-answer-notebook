import SubjectList from "./SubjectList";
import type {
  EntryKind,
  WrongAnswerEntry,
} from "../types";
import { entryKindName } from "../utils/appUi";
import { mistakeCauseLabel } from "../utils/mistakeAnalysis";
import { getImportantQuestionCount, getQuestionCount, getReviewNeedCount } from "../utils/questionMeta";
import { resolveEntryDifficultyScore } from "../utils/difficulty";

interface AppSidebarProps {
  activeSection: EntryKind;
  entries: WrongAnswerEntry[];
  setActiveSection: (section: EntryKind) => void;
  setSelectedId: (id: string | null) => void;
  onSectionSelect?: (section: EntryKind) => void;
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
  onOpenExamBuilder?: () => void;
  onOpenGeneratedExams?: () => void;
}

const sectionTabs = [
  ["wrong_answer", "📕 오답노트"],
  ["concept", "💡 개념노트"],
  ["problem_sheet", "📄 시험지함"],
  ["lecture", "🎓 특강자료"],
] as const;

export default function AppSidebar({
  activeSection,
  entries,
  setActiveSection,
  setSelectedId,
  onSectionSelect,
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
  onOpenExamBuilder,
  onOpenGeneratedExams,
}: AppSidebarProps) {
  const sectionEntries = entries.filter((entry) => entry.entryKind === activeSection);
  const sidebarStats =
    activeSection === "problem_sheet"
      ? [
          ["시험지", sectionEntries.length],
          ["총 문항", sectionEntries.reduce((sum, entry) => sum + getQuestionCount(entry), 0)],
          ["중요 문항", sectionEntries.reduce((sum, entry) => sum + getImportantQuestionCount(entry), 0)],
          ["복습 필요", sectionEntries.reduce((sum, entry) => sum + getReviewNeedCount(entry), 0)],
          [
            "평균 난이도",
            sectionEntries.length
              ? Math.round(sectionEntries.reduce((sum, entry) => sum + resolveEntryDifficultyScore(entry), 0) / sectionEntries.length)
              : 0,
          ],
        ]
      : activeSection === "concept"
        ? [
            ["개념", sectionEntries.length],
            ["완료", sectionEntries.filter((entry) => entry.mastered).length],
            ["태그", new Set(sectionEntries.flatMap((entry) => entry.tags)).size],
          ]
        : activeSection === "lecture"
          ? [
              ["특강", sectionEntries.length],
              ["블록", sectionEntries.reduce((sum, entry) => sum + (entry.learningBlocks?.length ?? 0), 0)],
              ["연결 문제", new Set(sectionEntries.flatMap((entry) => entry.linkedEntryIds ?? [])).size],
            ]
          : [
              ["전체", stats.total],
              ["복습 필요", stats.pending],
              ["어려움", stats.difficult],
            ];
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
            aria-current={activeSection === key ? "page" : undefined}
            onClick={() => {
              if (onSectionSelect) {
                onSectionSelect(key);
              } else {
                setActiveSection(key);
                setSelectedId(null);
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="stats">
        {sidebarStats.slice(0, 5).map(([label, value]) => (
          <div key={label} className="stat-card stat-card--compact">
            <div className="value">{value}</div>
            <div className="label">{label}</div>
          </div>
        ))}
      </div>

      {activeSection === "wrong_answer" && <div className="learning-insights">
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
      </div>}

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
        {activeSection === "problem_sheet" && onOpenExamBuilder && (
          <button type="button" className="btn-new" onClick={onOpenExamBuilder}>
            모의고사 만들기
          </button>
        )}
        {activeSection === "problem_sheet" && onOpenGeneratedExams && (
          <button type="button" className="btn-new btn-new--secondary" onClick={onOpenGeneratedExams}>
            내 모의고사
          </button>
        )}
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
