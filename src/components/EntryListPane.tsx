import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { writeUiStorageJson } from "../services/uiStorage";
import QuickConceptPanel from "./QuickConceptPanel";
import type { EntryFormData, EntryKind, Subject, WrongAnswerEntry } from "../types";
import {
  entryKindName,
} from "../utils/appUi";
import { getEntryTitle } from "../utils/entry";
import { normalizeQuestionMeta } from "../utils/questionMeta";
import { buildSheetGroups } from "../utils/sheetGroup";
import { difficultyScoreLabel } from "../utils/difficulty";
import Menu from "../shared/ui/Menu";
import type { SupplementalImportMode } from "../features/supplemental-resources/model/supplementalResource";
import { getSheetResourceStatus } from "../features/supplemental-resources/utils/getSheetResourceStatus";
import { ChevronLeft, ChevronRight, GripVertical, Plus } from "lucide-react";
import Dialog from "../shared/ui/Dialog";

interface EntryListPaneProps {
  activeSection: EntryKind;
  loading: boolean;
  entries: WrongAnswerEntry[];
  filtered: WrongAnswerEntry[];
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  onSelectEntry?: (id: string) => void;
  quickConceptSubject: Subject;
  onQuickConceptCreate: (data: EntryFormData) => Promise<void>;
  onOpenImportantQuestion?: (entryId: string, questionNumber: string) => void;
  onStartImportantReview?: () => void;
  onAddSupplemental?: (entryId: string, mode: SupplementalImportMode) => void;
  onManageSupplemental?: (entryId: string) => void;
  onEditEntry?: (entryId: string) => void;
  onDeleteEntry?: (entryId: string) => void;
  onLinkLearningEntry?: (entryId: string) => void;
  collapsed?: boolean;
  width?: number;
  onCollapsedChange?: (collapsed: boolean) => void;
  onWidthChange?: (width: number) => void;
}

const EXPANDED_GROUPS_KEY = "wrong-answer-expanded-sheet-groups";

function loadExpandedGroups(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(EXPANDED_GROUPS_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

export default function EntryListPane({
  activeSection,
  loading,
  entries,
  filtered,
  selectedId,
  setSelectedId,
  onSelectEntry,
  quickConceptSubject,
  onQuickConceptCreate,
  onOpenImportantQuestion,
  onStartImportantReview,
  onAddSupplemental,
  onManageSupplemental,
  onEditEntry,
  onDeleteEntry,
  onLinkLearningEntry,
  collapsed = false,
  width = 300,
  onCollapsedChange,
  onWidthChange,
}: EntryListPaneProps) {
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(loadExpandedGroups);
  const [showAllImportant, setShowAllImportant] = useState(false);
  const [conceptCreateOpen, setConceptCreateOpen] = useState(false);
  const importantQuestions = useMemo(
    () =>
      entries
        .filter((entry) => entry.entryKind === "problem_sheet")
        .flatMap((entry) =>
          normalizeQuestionMeta(entry.questionMeta)
            .filter((meta) => meta.important)
            .map((meta) => ({ entry, meta })),
        ),
    [entries],
  );
  const groupedSheets = useMemo(
    () => (activeSection === "problem_sheet" ? buildSheetGroups(filtered) : []),
    [activeSection, filtered],
  );

  const selectEntry = (entryId: string) => {
    if (onSelectEntry) {
      onSelectEntry(entryId);
      return;
    }
    setSelectedId(entryId);
  };

  useEffect(() => {
    if (activeSection !== "problem_sheet") return;
    const existing = new Set(groupedSheets.filter((item) => item.kind === "group").map((item) => item.groupId));
    setExpandedGroupIds((current) => {
      const next = new Set([...current].filter((id) => existing.has(id)));
      writeUiStorageJson(EXPANDED_GROUPS_KEY, [...next]);
      return next;
    });
  }, [activeSection, groupedSheets]);

  const updateExpandedGroups = (updater: (current: Set<string>) => Set<string>) => {
    setExpandedGroupIds((current) => {
      const next = updater(current);
      writeUiStorageJson(EXPANDED_GROUPS_KEY, [...next]);
      return next;
    });
  };

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (moveEvent: PointerEvent) => onWidthChange?.(startWidth + moveEvent.clientX - startX);
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
  };

  if (collapsed) {
    return (
      <aside className="entry-pane-restore" aria-label="항목 목록 접힘">
        <button
          type="button"
          className="ui-icon-button"
          aria-label="항목 목록 펼치기"
          title="항목 목록 펼치기"
          onClick={() => onCollapsedChange?.(false)}
        >
          <ChevronRight size={17} />
        </button>
      </aside>
    );
  }

  const renderEntryCard = (entry: WrongAnswerEntry) => {
    const resourceStatus = entry.entryKind === "problem_sheet" ? getSheetResourceStatus(entry) : null;
    return (
      <article
        key={entry.id}
        className={`entry-card ${selectedId === entry.id ? "selected" : ""} ${entry.mastered ? "mastered" : ""}`}
      >
        <button type="button" className="entry-card__main" onClick={() => selectEntry(entry.id)} aria-current={selectedId === entry.id ? "page" : undefined}>
        <div className="entry-card-header">
          {entry.entryKind === "problem_sheet" && (
            <span className="entry-card-subject">{entry.subject}</span>
          )}
          {entry.entryKind !== "problem_sheet" && <span className="entry-card-subject">{entry.subject}</span>}
          <span className="entry-mini-badge">{entryKindName(entry.entryKind)}</span>
          {entry.mastered ? <span className="entry-mini-badge">복습 완료</span> : entry.difficult ? <span className="entry-mini-badge">어려움</span> : null}
        </div>
        <p className="entry-card-question">{getEntryTitle(entry)}</p>
        <div className="entry-card-meta">
          <span>{new Date(entry.updatedAt).toLocaleDateString("ko-KR")}</span>
          {resourceStatus && (
            <span className="entry-resource-status">
              문항 {resourceStatus.questionCount}개
            </span>
          )}
        </div>
        </button>
        {entry.entryKind === "problem_sheet" && <div className="entry-card__actions"><Menu label="⋮" triggerAriaLabel={`${getEntryTitle(entry)} 추가 자료 및 관리`}>
          <button type="button" onClick={() => onAddSupplemental?.(entry.id, "answer_key")}>답지만 추가</button><button type="button" onClick={() => onAddSupplemental?.(entry.id, "answer_and_solution")}>답지와 해설 추가</button><button type="button" onClick={() => onAddSupplemental?.(entry.id, "solution")}>해설만 추가</button><button type="button" onClick={() => onAddSupplemental?.(entry.id, "source_pages")}>원본 페이지 추가</button><button type="button" onClick={() => onAddSupplemental?.(entry.id, "correction")}>정오표·보충자료 추가</button><button type="button" onClick={() => onLinkLearningEntry?.(entry.id)}>특강·개념자료 연결</button><button type="button" onClick={() => onManageSupplemental?.(entry.id)}>추가 자료 관리</button><button type="button" onClick={() => onEditEntry?.(entry.id)}>문제지 수정</button><button type="button" onClick={() => onDeleteEntry?.(entry.id)}>문제지 삭제</button>
        </Menu></div>}
      </article>
    );
  };
  return (
    <aside className="entry-list" style={{ "--entry-pane-width": `${width}px` } as CSSProperties} aria-label="항목 목록">
      <div className="entry-pane-controls">
        {activeSection === "concept" && <button type="button" className="ui-icon-button" aria-label="새 개념" title="새 개념" onClick={() => setConceptCreateOpen(true)}><Plus size={17} /></button>}
        <button
          type="button"
          className="ui-icon-button"
          aria-label="항목 목록 접기"
          title="항목 목록 접기"
          onClick={() => onCollapsedChange?.(true)}
        >
          <ChevronLeft size={17} />
        </button>
      </div>
      {conceptCreateOpen && <Dialog open size="sm" ariaLabel="새 개념" onClose={() => setConceptCreateOpen(false)}><QuickConceptPanel subject={quickConceptSubject} onCreate={async (data) => { await onQuickConceptCreate(data); setConceptCreateOpen(false); }} /></Dialog>}
      {activeSection === "problem_sheet" && importantQuestions.length > 0 && (
        <section className="important-question-panel" aria-label="중요 문제 모아보기">
          <header>
            <div>
              <span className="entry-mini-badge entry-mini-badge--difficulty-high">중요 문제</span>
              <strong>{importantQuestions.length}개</strong>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={onStartImportantReview}
            >
              중요 문제만 복습 시작
            </button>
            {importantQuestions.length > 8 && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowAllImportant((value) => !value)}
              >
                {showAllImportant ? "미리보기" : "전체 보기"}
              </button>
            )}
          </header>
          <div className="important-question-list">
            {(showAllImportant ? importantQuestions : importantQuestions.slice(0, 8)).map(({ entry, meta }) => (
              <article key={`${entry.id}-${meta.questionNumber}`} className="important-question-card">
                <span className="subject-badge">{entry.subject}</span>
                {entry.sheetGroup && <small>{entry.sheetGroup.groupTitle} / {entry.sheetGroup.partTitle}</small>}
                <strong>{getEntryTitle(entry)}</strong>
                <p>문제 {meta.questionNumber}</p>
                {meta.difficultyScore && <small>{difficultyScoreLabel(meta.difficultyScore)}</small>}
                {meta.bookmarkLabel && <small>라벨: {meta.bookmarkLabel}</small>}
                {meta.note && <small>{meta.note}</small>}
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => onOpenImportantQuestion?.(entry.id, meta.questionNumber)}
                >
                  바로 보기
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
      {loading ? (
        <div className="list-empty">불러오는 중…</div>
      ) : filtered.length === 0 ? (
        <div className="list-empty">
          {entries.filter((entry) => entry.entryKind === activeSection).length === 0
            ? `아직 등록된 ${entryKindName(activeSection)}가 없습니다.\n하단의 버튼으로 추가해 보세요.`
            : "검색 결과가 없습니다."}
        </div>
      ) : activeSection === "problem_sheet" ? (
        <>
          {groupedSheets.some((item) => item.kind === "group") && (
            <div className="sheet-group-bulk-actions">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() =>
                  updateExpandedGroups(() =>
                    new Set(groupedSheets.filter((item) => item.kind === "group").map((item) => item.groupId)),
                  )
                }
              >
                모두 펼치기
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => updateExpandedGroups(() => new Set())}
              >
                모두 접기
              </button>
            </div>
          )}
          {groupedSheets.map((item) =>
          item.kind === "single" ? (
            renderEntryCard(item.entry)
          ) : (
            <section key={item.groupId} className="sheet-group-card">
              <button
                type="button"
                className="sheet-group-card-head"
                onClick={() =>
                  updateExpandedGroups((current) => {
                    const next = new Set(current);
                    if (next.has(item.groupId)) next.delete(item.groupId);
                    else next.add(item.groupId);
                    return next;
                  })
                }
              >
                <span className="entry-mini-badge entry-mini-badge--sheet">묶음</span>
                <strong>{item.groupTitle}</strong>
                <small>{item.entries.length}개 파트 · 총 {item.totalQuestionCount}문항</small>
              </button>
              <div className="sheet-group-part-chips">
                {item.entries.map((entry) => (
                  <button key={entry.id} type="button" onClick={() => setSelectedId(entry.id)}>
                    {entry.sheetGroup?.partTitle || getEntryTitle(entry)}
                  </button>
                ))}
              </div>
              {expandedGroupIds.has(item.groupId) && (
                <div className="sheet-group-parts">
                  {item.entries.map((entry) => renderEntryCard(entry))}
                </div>
              )}
            </section>
          ),
        )}
        </>
      ) : (
        filtered.map((entry) => renderEntryCard(entry))
      )}
      <div
        className="entry-pane-resizer"
        role="separator"
        aria-label="항목 목록 너비 조절"
        aria-orientation="vertical"
        aria-valuemin={240}
        aria-valuemax={460}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          onWidthChange?.(width + (event.key === "ArrowRight" ? 16 : -16));
        }}
      >
        <GripVertical size={14} aria-hidden="true" />
      </div>
    </aside>
  );
}
