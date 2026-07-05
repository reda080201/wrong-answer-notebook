import { useMemo, useState } from "react";
import QuickConceptPanel from "./QuickConceptPanel";
import type { EntryFormData, EntryKind, Subject, WrongAnswerEntry } from "../types";
import {
  entryKindName,
  getEntryCardPreview,
  imageCount,
} from "../utils/appUi";
import { getEntryTitle } from "../utils/entry";
import { normalizeQuestionMeta } from "../utils/questionMeta";
import { buildSheetGroups } from "../utils/sheetGroup";

interface EntryListPaneProps {
  activeSection: EntryKind;
  loading: boolean;
  entries: WrongAnswerEntry[];
  filtered: WrongAnswerEntry[];
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  quickConceptSubject: Subject;
  onQuickConceptCreate: (data: EntryFormData) => Promise<void>;
  onOpenImportantQuestion?: (entryId: string, questionNumber: string) => void;
}

export default function EntryListPane({
  activeSection,
  loading,
  entries,
  filtered,
  selectedId,
  setSelectedId,
  quickConceptSubject,
  onQuickConceptCreate,
  onOpenImportantQuestion,
}: EntryListPaneProps) {
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => new Set());
  const importantQuestions = entries
    .filter((entry) => entry.entryKind === "problem_sheet")
    .flatMap((entry) =>
      normalizeQuestionMeta(entry.questionMeta)
        .filter((meta) => meta.important)
        .map((meta) => ({ entry, meta })),
    );
  const groupedSheets = useMemo(
    () => (activeSection === "problem_sheet" ? buildSheetGroups(filtered) : []),
    [activeSection, filtered],
  );

  const renderEntryCard = (entry: WrongAnswerEntry) => (
    <div
      key={entry.id}
      className={`entry-card ${selectedId === entry.id ? "selected" : ""} ${entry.mastered ? "mastered" : ""}`}
      onClick={() => setSelectedId(entry.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter") setSelectedId(entry.id);
      }}
    >
      <div className="entry-card-header">
        <span className="subject-badge">{entry.subject}</span>
        {entry.entryKind === "problem_sheet" && (
          <span className="entry-mini-badge entry-mini-badge--sheet">
            문제지
          </span>
        )}
        {entry.entryKind === "concept" && (
          <span className="entry-mini-badge entry-mini-badge--concept">
            개념
          </span>
        )}
        {entry.entryKind === "lecture" && (
          <span className="entry-mini-badge entry-mini-badge--lecture">
            특강
          </span>
        )}
        {entry.sheetGroup && (
          <span className="entry-mini-badge">{entry.sheetGroup.partTitle}</span>
        )}
        {entry.difficulty && entry.difficulty !== "none" && (
          <span
            className={`entry-mini-badge entry-mini-badge--difficulty entry-mini-badge--difficulty-${entry.difficulty}`}
          >
            {entry.difficulty === "high"
              ? "상"
              : entry.difficulty === "medium"
                ? "중"
                : "하"}
          </span>
        )}
        {entry.mastered && <span className="mastered-badge">✓ 완료</span>}
      </div>
      <p className="entry-card-question">{getEntryTitle(entry)}</p>
      {getEntryCardPreview(entry) && (
        <p className="entry-card-preview">{getEntryCardPreview(entry)}</p>
      )}
      <div className="entry-card-meta">
        <span>{new Date(entry.updatedAt).toLocaleDateString("ko-KR")}</span>
        {imageCount(entry) > 0 && (
          <span className="image-indicator">📷 {imageCount(entry)}</span>
        )}
        {entry.tags.length > 0 && <span>#{entry.tags[0]}</span>}
      </div>
    </div>
  );

  return (
    <div className="entry-list">
      {activeSection === "concept" && (
        <QuickConceptPanel
          subject={quickConceptSubject}
          onCreate={onQuickConceptCreate}
        />
      )}
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
              onClick={() =>
                onOpenImportantQuestion?.(
                  importantQuestions[0].entry.id,
                  importantQuestions[0].meta.questionNumber,
                )
              }
            >
              중요 문제만 복습 시작
            </button>
          </header>
          <div className="important-question-list">
            {importantQuestions.slice(0, 8).map(({ entry, meta }) => (
              <article key={`${entry.id}-${meta.questionNumber}`} className="important-question-card">
                <span className="subject-badge">{entry.subject}</span>
                <strong>{getEntryTitle(entry)}</strong>
                <p>문제 {meta.questionNumber}</p>
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
        groupedSheets.map((item) =>
          item.kind === "single" ? (
            renderEntryCard(item.entry)
          ) : (
            <section key={item.groupId} className="sheet-group-card">
              <button
                type="button"
                className="sheet-group-card-head"
                onClick={() =>
                  setExpandedGroupIds((current) => {
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
        )
      ) : (
        filtered.map((entry) => renderEntryCard(entry))
      )}
    </div>
  );
}
