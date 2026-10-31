import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { writeUiStorageJson } from "../services/uiStorage";
import QuickConceptPanel from "./QuickConceptPanel";
import type { EntryFormData, EntryKind, LibraryPreferences, Subject, WrongAnswerEntry } from "../types";
import {
  entryKindWithParticle,
  entryKindName,
} from "../utils/appUi";
import { getEntryTitle } from "../utils/entry";
import { normalizeQuestionMeta } from "../utils/questionMeta";
import { buildSheetGroups } from "../utils/sheetGroup";
import { difficultyScoreLabel } from "../utils/difficulty";
import Menu from "../shared/ui/Menu";
import type { SupplementalImportMode } from "../features/supplemental-resources/model/supplementalResource";
import { getSheetResourceStatus } from "../features/supplemental-resources/utils/getSheetResourceStatus";
import { ChevronLeft, ChevronRight, FileText, GripVertical, MoreHorizontal, Plus, Star } from "lucide-react";
import Dialog from "../shared/ui/Dialog";

interface EntryListPaneProps {
  viewKey?: string;
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
  libraryPreferences?: LibraryPreferences;
  onUpdateEntry?: (entryId: string, patch: Partial<WrongAnswerEntry>) => Promise<void>;
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
  viewKey = "",
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
  libraryPreferences,
  onUpdateEntry,
}: EntryListPaneProps) {
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(loadExpandedGroups);
  const [importantLimit, setImportantLimit] = useState(8);
  const [windowState, setWindowState] = useState({ key: "", count: 30 });
  const [conceptCreateOpen, setConceptCreateOpen] = useState(false);
  const [favoriteSavingId, setFavoriteSavingId] = useState<string | null>(null);
  const [favoriteErrorId, setFavoriteErrorId] = useState<string | null>(null);
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

  const orderedEntries = activeSection === "problem_sheet"
    ? groupedSheets.flatMap(item => item.kind === "single" ? [item.entry] : item.entries)
    : filtered;
  const listKey = JSON.stringify([activeSection, viewKey]);
  if (windowState.key !== listKey) setWindowState({ key: listKey, count: 30 });
  const visibleCount = windowState.key === listKey ? windowState.count : 30;
  const visibleIds = new Set(orderedEntries.slice(0, visibleCount).map(entry => entry.id));
  const revealedSelection = useRef<string | null>(null);
  useEffect(() => {
    if (revealedSelection.current === selectedId) return;
    if (!selectedId) { revealedSelection.current = null; return; }
    const index = orderedEntries.findIndex(entry => entry.id === selectedId);
    if (index < 0) return;
    revealedSelection.current = selectedId;
    setWindowState(current => ({ key: listKey, count: Math.max(current.key === listKey ? current.count : 30, Math.ceil((index + 1) / 30) * 30) }));
  }, [selectedId, listKey, orderedEntries]);

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
          title="목록"
          onClick={() => onCollapsedChange?.(false)}
        >
          <ChevronRight size={17} /><span className="entry-list-return-label">목록</span>
        </button>
      </aside>
    );
  }

  const renderEntryCard = (entry: WrongAnswerEntry) => {
    const resourceStatus = entry.entryKind === "problem_sheet" ? getSheetResourceStatus(entry) : null;
    if (activeSection === "problem_sheet" && libraryPreferences?.displayMode === "file") {
      const title = getEntryTitle(entry);
      const toggleFavorite = async (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (!onUpdateEntry || favoriteSavingId) return;
        setFavoriteSavingId(entry.id);
        setFavoriteErrorId(null);
        try {
          await onUpdateEntry(entry.id, { libraryFavorite: !entry.libraryFavorite });
        } catch {
          setFavoriteErrorId(entry.id);
        } finally {
          setFavoriteSavingId((current) => current === entry.id ? null : current);
        }
      };
      return <article key={entry.id} className={`entry-file-row ${selectedId === entry.id ? "selected" : ""}`}>
        <button type="button" className="entry-file-row__main" onClick={() => selectEntry(entry.id)} aria-current={selectedId === entry.id ? "page" : undefined} title={title}>
          <FileText size={17} aria-hidden="true" />
          <span className="entry-file-row__title">{title}</span>
          <span className="entry-file-row__meta">{entry.subject}</span>
          <span className="entry-file-row__meta">{resourceStatus?.questionCount ?? 1}문항</span>
          <time className="entry-file-row__meta" dateTime={entry.updatedAt}>{new Date(entry.updatedAt).toLocaleDateString("ko-KR")}</time>
        </button>
        <button type="button" className="entry-file-row__favorite" aria-label={entry.libraryFavorite ? "즐겨찾기에서 제거" : "즐겨찾기에 추가"} aria-pressed={entry.libraryFavorite === true} disabled={!onUpdateEntry || favoriteSavingId === entry.id} onClick={(event) => void toggleFavorite(event)}><Star size={16} fill={entry.libraryFavorite ? "currentColor" : "none"} /></button>
        <Menu label={<MoreHorizontal size={17} />} triggerAriaLabel={`${title} 더보기`} className="entry-file-row__menu" stopPropagation>
          <button type="button" onClick={() => selectEntry(entry.id)}>열기</button>
          {onEditEntry && <button type="button" onClick={() => onEditEntry(entry.id)}>문제지 수정</button>}
          {onDeleteEntry && <button type="button" onClick={() => onDeleteEntry(entry.id)}>문제지 삭제</button>}
        </Menu>
        {favoriteErrorId === entry.id && <span className="entry-file-row__error" role="status">즐겨찾기를 저장하지 못했습니다.</span>}
      </article>;
    }
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
            {importantQuestions.length > importantLimit && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setImportantLimit(value => value + 30)}
              >
                더 보기
              </button>
            )}
          </header>
          <div className="important-question-list">
            {importantQuestions.slice(0, importantLimit).map(({ entry, meta }) => (
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
        <div className="list-empty" role="status" aria-busy="true">불러오는 중…<div className="entry-list-placeholder" aria-hidden="true" /></div>
      ) : filtered.length === 0 ? (
        <div className="list-empty">
          {entries.filter((entry) => entry.entryKind === activeSection).length === 0
            ? `아직 등록된 ${entryKindWithParticle(activeSection, "subject")} 없습니다.`
            : "현재 검색 또는 필터 조건에 맞는 결과가 없습니다."}
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
          {groupedSheets.filter(item => item.kind === "single" ? visibleIds.has(item.entry.id) : item.entries.some(entry => visibleIds.has(entry.id))).map((item) =>
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
                {item.entries.filter(entry => visibleIds.has(entry.id)).map((entry) => (
                  <button key={entry.id} type="button" onClick={() => selectEntry(entry.id)}>
                    {entry.sheetGroup?.partTitle || getEntryTitle(entry)}
                  </button>
                ))}
              </div>
              {expandedGroupIds.has(item.groupId) && (
                <div className="sheet-group-parts">
                  {item.entries.filter(entry => visibleIds.has(entry.id)).map((entry) => renderEntryCard(entry))}
                </div>
              )}
            </section>
          ),
        )}
        </>
      ) : (
        filtered.slice(0, visibleCount).map((entry) => renderEntryCard(entry))
      )}
      {!loading && filtered.length > 0 && <div className="entry-list-pagination">
        <span>{Math.min(visibleCount, orderedEntries.length)} / {orderedEntries.length}개 표시</span>
        {visibleCount < orderedEntries.length && <button type="button" className="btn-secondary" onClick={() => setWindowState({ key: listKey, count: visibleCount + 30 })}>30개 더 보기</button>}
      </div>}
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
