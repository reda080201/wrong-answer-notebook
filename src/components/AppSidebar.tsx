import { useMemo } from "react";
import SubjectList from "./SubjectList";
import type {
  EntryKind,
  WrongAnswerEntry,
} from "../types";
import { entryKindName } from "../utils/appUi";
import { mistakeCauseLabel } from "../utils/mistakeAnalysis";
import { getImportantQuestionCount, getQuestionCount, getReviewNeedCount } from "../utils/questionMeta";
import { resolveEntryDifficultyScore } from "../utils/difficulty";
import {
  Archive,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  GraduationCap,
  Library,
  Lightbulb,
  MoreHorizontal,
  NotebookPen,
} from "lucide-react";
import Menu from "../shared/ui/Menu";
import type { AppNavigationControllerGroup } from "../hooks/useAppNavigationController";

interface AppSidebarProps {
  navigationController: AppNavigationControllerGroup;
  activeSection: EntryKind;
  entries: WrongAnswerEntry[];
  stats: {
    total: number;
    pending: number;
    difficult: number;
  };
  learningStats: ReturnType<
    typeof import("../utils/conceptAnalytics").buildLearningDashboardStats
  >;
  subjects: { order: string[]; filter: string | null; counts: Record<string, number>; sectionEntryCount: number; move(fromIndex: number, toIndex: number): void; select(subject: string | null): void };
  actions: { openNew(): void; openImport(): void; openLearningImport(): void; openExamBuilder?(): void };
  destinations: { learningHubOpen: boolean; questionBankOpen: boolean; libraryOpen: boolean };
  shell: { collapsed: boolean; onCollapsedChange?(collapsed: boolean): void };
}

const sectionTabs = [
  ["wrong_answer", "오답노트", NotebookPen],
  ["concept", "개념노트", Lightbulb],
  ["problem_sheet", "시험지함", FileText],
  ["lecture", "특강자료", GraduationCap],
] as const;

export default function AppSidebar({
  navigationController,
  activeSection,
  entries,
  stats,
  learningStats,
  subjects,
  actions,
  destinations,
  shell,
}: AppSidebarProps) {
  const { order: subjectOrder, filter: subjectFilter, counts: subjectCounts, sectionEntryCount } = subjects;
  const { openNew, openImport, openLearningImport, openExamBuilder: onOpenExamBuilder } = actions;
  const { learningHubOpen, questionBankOpen, libraryOpen } = destinations;
  const { collapsed, onCollapsedChange } = shell;
  const sectionEntries = useMemo(
    () => entries.filter((entry) => entry.entryKind === activeSection),
    [entries, activeSection],
  );
  const sidebarStats = useMemo(() => activeSection === "problem_sheet"
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
          ], [activeSection, sectionEntries, stats]);
  const handleSectionSelect = (section: EntryKind) => {
    void navigationController.requestNavigation({ section, entryId: null });
  };
  return (
    <aside className={`sidebar app-sidebar${collapsed ? " app-sidebar--collapsed" : ""}`} aria-label="주요 탐색">
      <div className="logo">
        <div className="logo-icon" aria-hidden="true"><BookOpen size={18} /></div>
        {!collapsed && <h1>오답노트</h1>}
        <button
          type="button"
          className="app-sidebar-collapse ui-icon-button"
          aria-label={collapsed ? "앱 사이드바 펼치기" : "앱 사이드바 접기"}
          title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          onClick={() => onCollapsedChange?.(!collapsed)}
        >
          {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
        </button>
      </div>

      <div className="section-tabs">
        {sectionTabs.map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            className={`section-tab-btn ${activeSection === key ? "active" : ""}`}
            aria-current={activeSection === key ? "page" : undefined}
            aria-label={label}
            title={collapsed ? label : undefined}
            onClick={() => {
              handleSectionSelect(key);
            }}
          >
            <Icon size={18} aria-hidden="true" />
            {!collapsed && <span>{label}</span>}
          </button>
        ))}
        <>
        {(
          <button
            type="button"
            className={`section-tab-btn ${learningHubOpen ? "active" : ""}`}
            aria-current={learningHubOpen ? "page" : undefined}
            aria-label="학습 허브"
            title={collapsed ? "학습 허브" : undefined}
            onClick={() => void navigationController.openLearningHub()}
          >
            <Library size={18} aria-hidden="true" />
            {!collapsed && <span>학습 허브</span>}
          </button>
        )}
        {(
          <button
            type="button"
            className={`section-tab-btn ${questionBankOpen ? "active" : ""}`}
            aria-current={questionBankOpen ? "page" : undefined}
            aria-label="문제 은행"
            title={collapsed ? "문제 은행" : undefined}
            onClick={() => void navigationController.openQuestionBank()}
          >
            <BookOpen size={18} aria-hidden="true" />
            {!collapsed && <span>문제 은행</span>}
          </button>
        )}
        {(
          <button
            type="button"
            className={`section-tab-btn ${libraryOpen ? "active" : ""}`}
            aria-current={libraryOpen ? "page" : undefined}
            aria-label="보관함"
            title={collapsed ? "보관함" : undefined}
            onClick={() => void navigationController.openLibrary()}
          >
            <Archive size={18} aria-hidden="true" />
            {!collapsed && <span>보관함</span>}
          </button>
        )}
        </>
      </div>

      {!collapsed && <details className="sidebar-summary">
        <summary>요약</summary>
        <dl>{sidebarStats.slice(0, 5).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </details>}

      {!collapsed && activeSection === "wrong_answer" && <div className="learning-insights">
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

      {!collapsed && <div className="filter-section app-sidebar-scroll-region">
        <h3>과목</h3>
        <SubjectList
          subjectOrder={subjectOrder}
          subjectFilter={subjectFilter}
          subjectCounts={subjectCounts}
          totalCount={sectionEntryCount}
            onSelect={subjects.select}
            onReorder={subjects.move}
        />
      </div>}

      <div className="sidebar-footer">
        {!collapsed && <button type="button" className="btn-new" onClick={openNew}>
          + 새 {entryKindName(activeSection)} 추가
        </button>}
        {!collapsed && activeSection !== "wrong_answer" && (
          <Menu label={<MoreHorizontal size={18} />} triggerAriaLabel="추가 작업">
            {activeSection === "problem_sheet" && onOpenExamBuilder && (
              <button type="button" onClick={onOpenExamBuilder}>모의고사 만들기</button>
            )}
            {(activeSection === "problem_sheet" || activeSection === "concept") && (
              <button type="button" onClick={openImport}>GPT 결과 가져오기</button>
            )}
            {activeSection === "lecture" && (
              <button type="button" onClick={openLearningImport}>HTML/MD/JSON 가져오기</button>
            )}
          </Menu>
        )}
      </div>
    </aside>
  );
}
