import { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Annotation, AnnotationTool, ChecklistItem, SheetAnswerItem, WrongAnswerEntry } from "../types";
import { hasExplanationContent } from "../utils/entry";
import { getRelatedEntries } from "../utils/concepts";
import { parseQuestionText, type QuestionBlock } from "../utils/textLayout";
import AnnotatableQuestion, { FocusedQuestionView } from "./AnnotatableQuestion";
import CollapsibleSection from "./CollapsibleSection";
import ConceptGraph from "./ConceptGraph";
import ContentBlock from "./ContentBlock";
import { LinkifiedText } from "../utils/wikiLinks";

interface EntryDetailProps {
  entry: WrongAnswerEntry;
  onEdit: () => void;
  onDelete: () => void;
  onToggleMastered: () => void;
  onToggleDifficult: () => void;
  onAnnotationsChange: (annotations: Annotation[]) => void;
  onChecklistChange?: (checklist: ChecklistItem[]) => void;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
  allEntries?: WrongAnswerEntry[];
  onOpenEntry?: (entryId: string) => void;
  onQuickGptSolution?: () => void;
  onExportMarkdown?: () => void;
  onOpenPrint?: () => void;
}

type SheetLayout = "single" | "columns";
type AnswerViewMode = "card" | "table";
type FocusMode = "closed" | "expanded" | "mini";
type FocusTextSize = "normal" | "large" | "xlarge";
type StudyPanel = "question" | "answer" | "explanation" | "notes" | "images";

const SHEET_LAYOUT_KEY = "wrong-answer-sheet-layout";
const ANSWER_VIEW_KEY = "wrong-answer-answer-view";
const ANSWER_HIDE_KEY = "wrong-answer-answer-hidden";
const FOCUS_TEXT_SIZE_KEY = "wrong-answer-focus-text-size";
const FOCUS_PANEL_KEY = "wrong-answer-focus-last-panel";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function loadSheetLayout(): SheetLayout {
  const saved = localStorage.getItem(SHEET_LAYOUT_KEY);
  return saved === "columns" ? "columns" : "single";
}

function loadAnswerView(): AnswerViewMode {
  return localStorage.getItem(ANSWER_VIEW_KEY) === "table" ? "table" : "card";
}

function loadAnswerHidden(): boolean {
  return localStorage.getItem(ANSWER_HIDE_KEY) === "true";
}

function loadFocusTextSize(): FocusTextSize {
  const saved = localStorage.getItem(FOCUS_TEXT_SIZE_KEY);
  return saved === "large" || saved === "xlarge" ? saved : "normal";
}

function loadFocusPanel(): StudyPanel {
  const saved = localStorage.getItem(FOCUS_PANEL_KEY);
  return saved === "answer" || saved === "explanation" || saved === "notes" || saved === "images" ? saved : "question";
}

function normalizeQuestionNumber(value: string): string {
  return value.trim().replace(/^#/, "").replace(/[.)번]\s*$/, "").replace(/^0+/, "") || value.trim();
}

export default function EntryDetail({
  entry,
  onEdit,
  onDelete,
  onToggleMastered,
  onToggleDifficult,
  onAnnotationsChange,
  onChecklistChange,
  onWikiLinkClick,
  existingTargets,
  allEntries = [],
  onOpenEntry,
  onQuickGptSolution,
  onExportMarkdown,
  onOpenPrint,
}: EntryDetailProps) {
  const [focusMode, setFocusMode] = useState<FocusMode>("closed");
  const [focusTextSize, setFocusTextSize] = useState<FocusTextSize>(loadFocusTextSize);
  const [activeStudyPanel, setActiveStudyPanel] = useState<StudyPanel>(loadFocusPanel);
  const [memoMode, setMemoMode] = useState(false);
  const [sheetLayout, setSheetLayout] = useState<SheetLayout>(loadSheetLayout);
  const [sheetSearch, setSheetSearch] = useState("");
  const [answerView, setAnswerView] = useState<AnswerViewMode>(loadAnswerView);
  const [hideAnswers, setHideAnswers] = useState(loadAnswerHidden);
  const [focusedQuestionIndex, setFocusedQuestionIndex] = useState(0);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [newChecklistText, setNewChecklistText] = useState("");
  const [activeTool, setActiveTool] = useState<AnnotationTool | "erase">(
    "highlight",
  );

  const filledParts = entry.explanationParts
    .map((p, i) => ({ part: p, index: i }))
    .filter(({ part }) => part.text.trim() || part.images.length > 0);

  const explanationBadge =
    filledParts.length > 0
      ? `${filledParts.length}개 · 이미지 ${filledParts.reduce((n, { part }) => n + part.images.length, 0)}`
      : undefined;

  const annCount = entry.annotations?.length ?? 0;
  const isSheet = entry.entryKind === "problem_sheet";
  const isConcept = entry.entryKind === "concept";
  const isWrongAnswer = entry.entryKind === "wrong_answer";
  const isFocusable = !isConcept;
  const isFocusExpanded = isFocusable && focusMode === "expanded";
  const isFocusMini = isFocusable && focusMode === "mini";
  const sheetAnswerKey = (entry.answerKey ?? []).filter(
    (item) =>
      item.questionNumber.trim() ||
      item.answer.trim() ||
      item.explanation.trim() ||
      item.importantPoints.length,
  );
  const questionBlocks = useMemo(() => parseQuestionText(entry.question), [entry.question]);
  const questionAnchors = questionBlocks.filter((block) => block.kind === "question");
  const focusedQuestion = questionAnchors[focusedQuestionIndex] as QuestionBlock | undefined;
  const focusedPassage = (() => {
    if (!focusedQuestion) return undefined;
    const currentIndex = questionBlocks.findIndex((block) => block === focusedQuestion);
    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      const block = questionBlocks[index];
      if (block.kind === "passage" || block.kind === "paragraph") return block;
      if (block.kind === "question") break;
    }
    return undefined;
  })();
  const sheetMatches = useMemo(() => {
    const q = sheetSearch.trim().toLowerCase();
    if (!q) return [];
    return questionBlocks.filter(
      (block) =>
        block.kind === "question" &&
        `${block.displayNumber} ${block.numberLabel} ${block.body} ${block.choices.map((choice) => choice.text).join(" ")}`
          .toLowerCase()
          .includes(q),
    );
  }, [questionBlocks, sheetSearch]);
  const relatedEntries = useMemo(
    () => (isConcept ? getRelatedEntries(entry, allEntries) : []),
    [allEntries, entry, isConcept],
  );

  useEffect(() => {
    localStorage.setItem(SHEET_LAYOUT_KEY, sheetLayout);
  }, [sheetLayout]);

  useEffect(() => {
    localStorage.setItem(ANSWER_VIEW_KEY, answerView);
  }, [answerView]);

  useEffect(() => {
    localStorage.setItem(ANSWER_HIDE_KEY, hideAnswers ? "true" : "false");
  }, [hideAnswers]);

  useEffect(() => {
    localStorage.setItem(FOCUS_TEXT_SIZE_KEY, focusTextSize);
  }, [focusTextSize]);

  useEffect(() => {
    localStorage.setItem(FOCUS_PANEL_KEY, activeStudyPanel);
  }, [activeStudyPanel]);

  useEffect(() => {
    setActiveSearchIndex(0);
  }, [sheetSearch, entry.id]);

  useEffect(() => {
    setFocusedQuestionIndex(0);
    setFocusMode("closed");
  }, [entry.id]);

  useEffect(() => {
    if (focusedQuestionIndex >= questionAnchors.length) {
      setFocusedQuestionIndex(Math.max(0, questionAnchors.length - 1));
    }
  }, [focusedQuestionIndex, questionAnchors.length]);

  useEffect(() => {
    if (!isSheet || focusMode === "closed" || questionAnchors.length === 0) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setFocusedQuestionIndex((index) => Math.max(0, index - 1));
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setFocusedQuestionIndex((index) => Math.min(questionAnchors.length - 1, index + 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusMode, isSheet, questionAnchors.length]);

  const scrollToQuestion = (start: number) => {
    document.getElementById(`sheet-question-${start}`)?.scrollIntoView({
      block: "start",
      behavior: "smooth",
    });
  };

  const moveSearch = (delta: number) => {
    if (sheetMatches.length === 0) return;
    const nextIndex = (activeSearchIndex + delta + sheetMatches.length) % sheetMatches.length;
    setActiveSearchIndex(nextIndex);
    const match = sheetMatches[nextIndex];
    if (match?.kind === "question") scrollToQuestion(match.start);
  };

  const updateChecklist = (next: ChecklistItem[]) => {
    onChecklistChange?.(next);
  };

  const moveFocusedQuestion = (delta: number) => {
    setFocusedQuestionIndex((index) => Math.max(0, Math.min(questionAnchors.length - 1, index + delta)));
  };

  const cycleFocusTextSize = (delta: number) => {
    const sizes: FocusTextSize[] = ["normal", "large", "xlarge"];
    setFocusTextSize((current) => {
      const currentIndex = sizes.indexOf(current);
      return sizes[Math.max(0, Math.min(sizes.length - 1, currentIndex + delta))];
    });
  };

  const openFocusMode = () => {
    if (isFocusable) setFocusMode("expanded");
  };

  const findQuestionTarget = (questionNumber: string) => {
    const normalized = normalizeQuestionNumber(questionNumber);
    return questionAnchors.find(
      (block) =>
        block.kind === "question" &&
        (normalizeQuestionNumber(block.numberLabel) === normalized ||
          String(block.displayNumber) === normalized),
    );
  };

  const answerMatchesQuestion = (item: SheetAnswerItem, question: QuestionBlock) => {
    const normalized = normalizeQuestionNumber(item.questionNumber);
    return (
      normalized === String(question.displayNumber) ||
      normalized === normalizeQuestionNumber(question.numberLabel)
    );
  };

  const focusedAnswer = focusedQuestion
    ? sheetAnswerKey.find((item) => answerMatchesQuestion(item, focusedQuestion))
    : undefined;

  const focusedHasNotes = Boolean(
    entry.memo.trim() ||
      focusedAnswer?.notes?.trim() ||
      focusedAnswer?.importantPoints.length ||
      focusedAnswer?.sourceNote?.trim() ||
      focusedAnswer?.needsReview,
  );
  const hasWrongAnswerText = Boolean(entry.myAnswer.trim() || entry.correctAnswer.trim());
  const wrongAnswerHasNotes = Boolean(entry.memo.trim());
  const canShowActiveStudyPanel =
    activeStudyPanel === "question" ||
    (activeStudyPanel === "answer" && (isSheet ? sheetAnswerKey.length > 0 : hasWrongAnswerText)) ||
    (activeStudyPanel === "explanation" && !isSheet && hasExplanationContent(entry)) ||
    (activeStudyPanel === "notes" && (isSheet ? focusedHasNotes : wrongAnswerHasNotes)) ||
    (activeStudyPanel === "images" && entry.questionImages.length > 0);

  useEffect(() => {
    if (!isFocusable || focusMode === "closed" || canShowActiveStudyPanel) return;
    setActiveStudyPanel("question");
  }, [canShowActiveStudyPanel, focusMode, isFocusable]);

  const renderAnswerKey = () =>
    answerView === "table" ? (
      <div className="sheet-answer-table">
        <div className="sheet-answer-table-head">
          <span>번호</span>
          <span>정답</span>
          <span>난이도</span>
          <span>개념</span>
          <span>풀이</span>
        </div>
        {sheetAnswerKey.map((item) => {
          const target = findQuestionTarget(item.questionNumber);
          return (
            <div key={item.id} className="sheet-answer-table-row">
              <button
                type="button"
                className="sheet-answer-number"
                onClick={() => {
                  if (target?.kind === "question") scrollToQuestion(target.start);
                }}
                disabled={!target}
              >
                {item.questionNumber || "검토"}번
              </button>
              <strong className={hideAnswers ? "answer-hidden" : ""}>
                {hideAnswers ? "•••" : item.answer || "정답 없음"}
              </strong>
              <span>{item.difficulty === "high" ? "상" : item.difficulty === "medium" ? "중" : item.difficulty === "low" ? "하" : "-"}</span>
              <span>{item.concepts?.join(", ") || "-"}</span>
              <span className={hideAnswers ? "answer-hidden" : ""}>{hideAnswers ? "가려짐" : item.explanation || "-"}</span>
            </div>
          );
        })}
      </div>
    ) : (
      <div className="sheet-answer-list">
        {sheetAnswerKey.map((item) => {
          const target = findQuestionTarget(item.questionNumber);
          return (
            <article key={item.id} className="sheet-answer-card">
              <div className="sheet-answer-card-head">
                <button
                  type="button"
                  className="sheet-answer-number"
                  onClick={() => {
                    if (target?.kind === "question") scrollToQuestion(target.start);
                  }}
                  disabled={!target}
                >
                  {item.questionNumber || "검토"}번
                </button>
                <strong className={hideAnswers ? "answer-hidden" : ""}>
                  {hideAnswers ? "•••" : item.answer || "정답 없음"}
                </strong>
                {item.needsReview && <span className="answer-review-badge">검토 필요</span>}
                {item.difficulty && (
                  <span className={`difficulty-badge difficulty-badge--${item.difficulty}`}>
                    {item.difficulty === "high" ? "상" : item.difficulty === "medium" ? "중" : "하"}
                  </span>
                )}
              </div>
              {item.concepts?.length ? (
                <div className="sheet-answer-concepts">
                  {item.concepts.map((concept) => (
                    <button key={concept} type="button" onClick={() => onWikiLinkClick(concept)}>
                      [[{concept}]]
                    </button>
                  ))}
                </div>
              ) : null}
              {!hideAnswers && item.notes?.trim() && <p className="sheet-answer-source">문제별 메모: {item.notes}</p>}
              {item.sourceNote?.trim() && <p className="sheet-answer-source">{item.sourceNote}</p>}
              {item.explanation.trim() && (
                <div className={`sheet-answer-explanation ${hideAnswers ? "answer-hidden" : ""}`}>
                  {hideAnswers ? (
                    "답 가리기 모드입니다."
                  ) : (
                    <LinkifiedText
                      text={item.explanation}
                      onLinkClick={onWikiLinkClick}
                      existingTargets={existingTargets}
                    />
                  )}
                </div>
              )}
              {!hideAnswers && item.importantPoints.length > 0 && (
                <ul className="sheet-answer-points">
                  {item.importantPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    );

  const renderAnswerToolbar = () => (
    <div className="sheet-answer-toolbar">
      <button
        type="button"
        className={`btn-secondary btn-sm ${hideAnswers ? "active" : ""}`}
        onClick={() => setHideAnswers((value) => !value)}
      >
        {hideAnswers ? "정답 보이기" : "답 가리기"}
      </button>
      <div className="sheet-layout-toggle" aria-label="답안지 보기 방식">
        <button
          type="button"
          className={answerView === "card" ? "active" : ""}
          onClick={() => setAnswerView("card")}
        >
          카드
        </button>
        <button
          type="button"
          className={answerView === "table" ? "active" : ""}
          onClick={() => setAnswerView("table")}
        >
          표
        </button>
      </div>
    </div>
  );

  const renderFocusedAnswer = () => {
    if (!focusedAnswer) {
      return <div className="focused-empty-panel">현재 문제에 연결된 답안이 없습니다.</div>;
    }

    return (
      <article className="focused-answer-card">
        <header>
          <span className="focused-section-label">답지</span>
          <strong className={hideAnswers ? "answer-hidden" : ""}>
            {hideAnswers ? "•••" : focusedAnswer.answer || "정답 없음"}
          </strong>
          {focusedAnswer.needsReview && <span className="answer-review-badge">검토 필요</span>}
        </header>
        {focusedAnswer.sourceNote?.trim() && (
          <p className="sheet-answer-source">{focusedAnswer.sourceNote}</p>
        )}
        {!hideAnswers && focusedAnswer.notes?.trim() && (
          <p className="sheet-answer-source">문제별 메모: {focusedAnswer.notes}</p>
        )}
        {focusedAnswer.explanation.trim() && (
          <div className={`focused-answer-explanation ${hideAnswers ? "answer-hidden" : ""}`}>
            {hideAnswers ? (
              "답 가리기 모드입니다."
            ) : (
              <LinkifiedText
                text={focusedAnswer.explanation}
                onLinkClick={onWikiLinkClick}
                existingTargets={existingTargets}
              />
            )}
          </div>
        )}
        {!hideAnswers && focusedAnswer.importantPoints.length > 0 && (
          <ul className="sheet-answer-points">
            {focusedAnswer.importantPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        )}
      </article>
    );
  };

  const renderFocusedNotes = () => {
    if (!focusedHasNotes) {
      return <div className="focused-empty-panel">현재 문제에 표시할 필기가 없습니다.</div>;
    }

    return (
      <div className="focused-notes-panel">
        {entry.memo.trim() && (
          <section className="sheet-study-note-card sheet-study-note-card--global">
            <strong>전체 메모</strong>
            <div className="memo-content">
              <LinkifiedText
                text={entry.memo}
                onLinkClick={onWikiLinkClick}
                existingTargets={existingTargets}
              />
            </div>
          </section>
        )}
        {focusedAnswer && (
          <article className="sheet-study-note-card">
            <strong>현재 문제 메모 {focusedAnswer.questionNumber ? `(${focusedAnswer.questionNumber}번)` : ""}</strong>
            {focusedAnswer.needsReview && <span className="answer-review-badge">번호 확인 필요</span>}
            {focusedAnswer.notes?.trim() && <p>{focusedAnswer.notes}</p>}
            {focusedAnswer.sourceNote?.trim() && <p>{focusedAnswer.sourceNote}</p>}
            {focusedAnswer.importantPoints.length > 0 && (
              <ul>
                {focusedAnswer.importantPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            )}
          </article>
        )}
      </div>
    );
  };

  return (
    <div
      className={`detail-panel detail-panel--review detail-panel--sheet-${sheetLayout} detail-panel--focus-${focusMode} detail-panel--focus-text-${focusTextSize} ${isFocusExpanded ? "detail-panel--zoom" : ""} ${memoMode ? "detail-panel--memo" : ""}`}
    >
      {!isFocusExpanded && (
      <div className="detail-toolbar">
        <div className="detail-toolbar-left">
          <span className="subject-badge">{entry.subject}</span>
          {isSheet ? (
            <span className="kind-badge kind-badge--sheet">문제지</span>
          ) : isConcept ? (
            <span className="kind-badge kind-badge--concept">개념</span>
          ) : (
            <span className="kind-badge kind-badge--wrong">오답</span>
          )}
          {entry.difficulty && entry.difficulty !== "none" && (
            <span className={`difficulty-badge difficulty-badge--${entry.difficulty}`}>
              난이도: {entry.difficulty === "high" ? "상" : entry.difficulty === "medium" ? "중" : "하"}
            </span>
          )}
          {entry.tags.map((t) => (
            <span key={t} className="tag">
              #{t}
            </span>
          ))}
          {isSheet && (
            <div className="sheet-layout-toggle" aria-label="시험지 보기 방식">
              <button
                type="button"
                className={sheetLayout === "single" ? "active" : ""}
                onClick={() => setSheetLayout("single")}
              >
                단일 열
              </button>
              <button
                type="button"
                className={sheetLayout === "columns" ? "active" : ""}
                onClick={() => setSheetLayout("columns")}
              >
                2단
              </button>
            </div>
          )}
        </div>
        <div className="detail-actions">
          <div className="detail-actions-primary">
            {isFocusable && (
              <button
                type="button"
                className="btn-icon btn-focus-primary"
                onClick={openFocusMode}
                title={isSheet ? "문제 집중 보기" : "오답 집중 보기"}
              >
                집중 보기
              </button>
            )}
            {onQuickGptSolution && (
              <button type="button" className="btn-icon" onClick={onQuickGptSolution}>
                GPT 해설
              </button>
            )}
            <button type="button" className="btn-icon" onClick={onEdit}>
              수정
            </button>
          </div>
          <div className="detail-actions-secondary">
            <button
              type="button"
              className={`btn-icon ${entry.difficult ? "active-difficult" : ""}`}
              onClick={onToggleDifficult}
              title="어려운 문제 표시"
            >
              ★ 어려움
            </button>
            {isSheet && (
              <>
                <button type="button" className="btn-icon" onClick={onExportMarkdown}>
                  Markdown
                </button>
                <button type="button" className="btn-icon" onClick={onOpenPrint}>
                  PDF 인쇄
                </button>
              </>
            )}
            <button
              type="button"
              className={`btn-icon btn-memo ${memoMode ? "active" : ""}`}
              onClick={() => setMemoMode((m) => !m)}
              title="메모·형광펜 모드"
            >
              ✎ 메모 {memoMode ? "ON" : "OFF"}
            </button>
            <button
              type="button"
              className={`btn-icon ${entry.mastered ? "success" : ""}`}
              onClick={onToggleMastered}
            >
              {entry.mastered ? "✓ 완료" : "복습 완료"}
            </button>
            <button type="button" className="btn-icon danger" onClick={onDelete}>
              삭제
            </button>
          </div>
        </div>
      </div>
      )}

      {memoMode && (
        <div className="memo-toolbar">
          <span className="memo-toolbar-label">도구</span>
          <button
            type="button"
            className={`memo-tool ${activeTool === "highlight" ? "active" : ""}`}
            onClick={() => setActiveTool("highlight")}
          >
            🖍 형광펜
          </button>
          <button
            type="button"
            className={`memo-tool ${activeTool === "underline" ? "active" : ""}`}
            onClick={() => setActiveTool("underline")}
          >
            ＿ 밑줄
          </button>
          <button
            type="button"
            className={`memo-tool ${activeTool === "erase" ? "active" : ""}`}
            onClick={() => setActiveTool("erase")}
          >
            ⌫ 지우기
          </button>
          <span className="memo-toolbar-hint">
            텍스트: 드래그 선택 · 이미지: 영역 드래그 · 지우기: 표시 클릭
            {annCount > 0 && ` (${annCount})`}
          </span>
        </div>
      )}

      {isFocusExpanded && isSheet && (
        <div className="focused-sheet-nav" aria-label="문제 집중 보기 이동">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => moveFocusedQuestion(-1)}
            disabled={focusedQuestionIndex === 0}
          >
            이전
          </button>
          <strong>
            문제 {focusedQuestion ? focusedQuestion.displayNumber : 0}
            <span> / {questionAnchors.length}</span>
          </strong>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => moveFocusedQuestion(1)}
            disabled={focusedQuestionIndex >= questionAnchors.length - 1}
          >
            다음
          </button>
          <button type="button" className="btn-secondary" onClick={() => setFocusMode("closed")}>
            나가기
          </button>
        </div>
      )}
      {isFocusExpanded && isWrongAnswer && (
        <div className="focused-sheet-nav focused-sheet-nav--single" aria-label="오답 집중 보기">
          <strong>{entry.title.trim() || "오답 집중 보기"}</strong>
          <button type="button" className="btn-secondary" onClick={() => setFocusMode("closed")}>
            나가기
          </button>
        </div>
      )}

      <div className="detail-scroll">
        <header className="detail-title-block">
          <h2 className="detail-title">{entry.title.trim() || "(제목 없음)"}</h2>
          <span className="detail-date">{formatDate(entry.updatedAt)}</span>
        </header>

        <section className="detail-question-section">
          <h3 className="section-heading">
            {isSheet ? (isFocusExpanded ? "문제 집중 보기" : "문제지 · 지문") : isConcept ? "개념 설명" : "문제 · 지문"}
          </h3>
          {isSheet && !isFocusExpanded && (
            <div className="sheet-reading-tools">
              {questionAnchors.length > 0 && (
                <nav className="sheet-toc" aria-label="문제 번호 목차">
                  {questionAnchors.map((block, index) => (
                    <button
                      key={block.start}
                      type="button"
                      onClick={() => {
                        setFocusedQuestionIndex(index);
                        scrollToQuestion(block.start);
                      }}
                    >
                      {block.displayNumber}
                    </button>
                  ))}
                </nav>
              )}
              <div className="sheet-search">
                <input
                  type="search"
                  value={sheetSearch}
                  onChange={(event) => setSheetSearch(event.target.value)}
                  placeholder="시험지 안에서 검색"
                />
                <span>
                  {sheetSearch.trim() ? `${sheetMatches.length}개` : "검색"}
                </span>
                <button type="button" onClick={() => moveSearch(-1)} disabled={sheetMatches.length === 0}>
                  이전
                </button>
                <button type="button" onClick={() => moveSearch(1)} disabled={sheetMatches.length === 0}>
                  다음
                </button>
              </div>
            </div>
          )}
          {isSheet && isFocusExpanded ? (
            focusedQuestion ? (
              <>
                <FocusedQuestionView
                  passage={focusedPassage}
                  questionBlock={focusedQuestion}
                  questionImages={entry.questionImages}
                  figures={entry.figures ?? []}
                  annotations={entry.annotations ?? []}
                  memoMode={memoMode}
                  activeTool={activeTool}
                  onAnnotationsChange={onAnnotationsChange}
                  onWikiLinkClick={onWikiLinkClick}
                  existingTargets={existingTargets}
                  showImages={activeStudyPanel === "images"}
                />
                <div className="focus-panel-tabs" aria-label="집중 보기 패널">
                  <button
                    type="button"
                    className={activeStudyPanel === "question" ? "active" : ""}
                    onClick={() => setActiveStudyPanel("question")}
                  >
                    문제
                  </button>
                  <button
                    type="button"
                    className={activeStudyPanel === "answer" ? "active" : ""}
                    onClick={() => setActiveStudyPanel("answer")}
                    disabled={sheetAnswerKey.length === 0}
                  >
                    답지
                  </button>
                  <button
                    type="button"
                    className={activeStudyPanel === "notes" ? "active" : ""}
                    onClick={() => setActiveStudyPanel("notes")}
                    disabled={!focusedHasNotes}
                  >
                    필기
                  </button>
                  <button
                    type="button"
                    className={activeStudyPanel === "images" ? "active" : ""}
                    onClick={() => setActiveStudyPanel("images")}
                    disabled={entry.questionImages.length === 0}
                  >
                    이미지
                  </button>
                </div>
              </>
            ) : (
              <div className="focused-empty-panel">
                표시할 문제를 찾지 못했습니다.
              </div>
            )
          ) : isWrongAnswer && isFocusExpanded ? (
            <>
              <div className="wrong-focus-question">
                <AnnotatableQuestion
                  question={entry.question}
                  questionImages={activeStudyPanel === "images" ? entry.questionImages : []}
                  annotations={entry.annotations ?? []}
                  memoMode={memoMode}
                  activeTool={activeTool}
                  onAnnotationsChange={onAnnotationsChange}
                  onWikiLinkClick={onWikiLinkClick}
                  existingTargets={existingTargets}
                  sheetLayout="single"
                  searchQuery=""
                />
              </div>
              <div className="focus-panel-tabs" aria-label="오답 집중 보기 패널">
                <button
                  type="button"
                  className={activeStudyPanel === "question" ? "active" : ""}
                  onClick={() => setActiveStudyPanel("question")}
                >
                  문제
                </button>
                <button
                  type="button"
                  className={activeStudyPanel === "answer" ? "active" : ""}
                  onClick={() => setActiveStudyPanel("answer")}
                  disabled={!hasWrongAnswerText}
                >
                  정답
                </button>
                <button
                  type="button"
                  className={activeStudyPanel === "explanation" ? "active" : ""}
                  onClick={() => setActiveStudyPanel("explanation")}
                  disabled={!hasExplanationContent(entry)}
                >
                  해설
                </button>
                <button
                  type="button"
                  className={activeStudyPanel === "notes" ? "active" : ""}
                  onClick={() => setActiveStudyPanel("notes")}
                  disabled={!wrongAnswerHasNotes}
                >
                  메모
                </button>
                <button
                  type="button"
                  className={activeStudyPanel === "images" ? "active" : ""}
                  onClick={() => setActiveStudyPanel("images")}
                  disabled={entry.questionImages.length === 0}
                >
                  이미지
                </button>
              </div>
            </>
          ) : (
            <AnnotatableQuestion
              question={entry.question}
              questionImages={entry.questionImages}
              figures={entry.figures ?? []}
              annotations={entry.annotations ?? []}
              memoMode={memoMode}
              activeTool={activeTool}
              onAnnotationsChange={onAnnotationsChange}
              onWikiLinkClick={onWikiLinkClick}
              existingTargets={existingTargets}
              sheetLayout={isSheet ? sheetLayout : "single"}
              searchQuery={isSheet ? sheetSearch : ""}
            />
          )}
        </section>

        {isFocusExpanded && isSheet && activeStudyPanel === "answer" && sheetAnswerKey.length > 0 && (
          <section className="sheet-study-panel sheet-study-panel--answers">
            <div className="sheet-study-panel-head">
              <h3 className="section-heading">답지</h3>
              {renderAnswerToolbar()}
            </div>
            {renderFocusedAnswer()}
          </section>
        )}

        {isFocusExpanded && isSheet && activeStudyPanel === "notes" && focusedHasNotes && (
          <section className="sheet-study-panel sheet-study-panel--notes">
            <h3 className="section-heading">필기</h3>
            {renderFocusedNotes()}
          </section>
        )}

        {isFocusExpanded && isWrongAnswer && activeStudyPanel === "answer" && hasWrongAnswerText && (
          <section className="sheet-study-panel sheet-study-panel--answers">
            <h3 className="section-heading">정답</h3>
            <div className="detail-answers-row">
              {entry.myAnswer.trim() && (
                <div className="answer-card answer-card--wrong">
                  <label>내 답</label>
                  <p>
                    <LinkifiedText
                      text={entry.myAnswer}
                      onLinkClick={onWikiLinkClick}
                      existingTargets={existingTargets}
                    />
                  </p>
                </div>
              )}
              {entry.correctAnswer.trim() && (
                <div className="answer-card answer-card--correct">
                  <label>정답</label>
                  <p>
                    <LinkifiedText
                      text={entry.correctAnswer}
                      onLinkClick={onWikiLinkClick}
                      existingTargets={existingTargets}
                    />
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {isFocusExpanded && isWrongAnswer && activeStudyPanel === "explanation" && hasExplanationContent(entry) && (
          <section className="sheet-study-panel sheet-study-panel--answers">
            <h3 className="section-heading">해설</h3>
            <div className="explanation-parts-detail">
              {filledParts.map(({ part, index }) => (
                <div key={part.id} className="explanation-part-detail">
                  <h4 className="explanation-part-detail-title">해설 {index + 1}</h4>
                  <ContentBlock
                    text={part.text}
                    images={part.images}
                    variant="fill"
                    onWikiLinkClick={onWikiLinkClick}
                    existingTargets={existingTargets}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {isFocusExpanded && isWrongAnswer && activeStudyPanel === "notes" && wrongAnswerHasNotes && (
          <section className="sheet-study-panel sheet-study-panel--notes">
            <h3 className="section-heading">메모</h3>
            <div className="memo-content">
              <LinkifiedText
                text={entry.memo}
                onLinkClick={onWikiLinkClick}
                existingTargets={existingTargets}
              />
            </div>
          </section>
        )}

        {isConcept && (
          <CollapsibleSection title="개념 체크리스트" defaultOpen>
            <div className="concept-checklist">
              {(entry.checklist ?? []).map((item) => (
                <label key={item.id} className="concept-checklist-item">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(event) =>
                      updateChecklist(
                        (entry.checklist ?? []).map((current) =>
                          current.id === item.id
                            ? { ...current, checked: event.target.checked }
                            : current,
                        ),
                      )
                    }
                  />
                  <span>{item.text}</span>
                  <button
                    type="button"
                    className="btn-icon danger"
                    onClick={() =>
                      updateChecklist((entry.checklist ?? []).filter((current) => current.id !== item.id))
                    }
                  >
                    삭제
                  </button>
                </label>
              ))}
              <div className="concept-checklist-add">
                <input
                  value={newChecklistText}
                  onChange={(event) => setNewChecklistText(event.target.value)}
                  placeholder="체크리스트 항목"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && newChecklistText.trim()) {
                      updateChecklist([
                        ...(entry.checklist ?? []),
                        { id: uuidv4(), text: newChecklistText.trim(), checked: false },
                      ]);
                      setNewChecklistText("");
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    if (!newChecklistText.trim()) return;
                    updateChecklist([
                      ...(entry.checklist ?? []),
                      { id: uuidv4(), text: newChecklistText.trim(), checked: false },
                    ]);
                    setNewChecklistText("");
                  }}
                >
                  추가
                </button>
              </div>
            </div>
          </CollapsibleSection>
        )}

        {isSheet && !isFocusExpanded && sheetAnswerKey.length > 0 && (
          <CollapsibleSection
            title="답안지"
            badge={`${sheetAnswerKey.length}개`}
            defaultOpen={false}
          >
            {renderAnswerToolbar()}
            {renderAnswerKey()}
          </CollapsibleSection>
        )}

        {!isFocusExpanded && !isSheet && !isConcept && (entry.myAnswer || entry.correctAnswer) && (
          <section className="detail-answers-row">
            {entry.myAnswer && (
              <div className="answer-card answer-card--wrong">
                <label>내 답</label>
                <p>
                  <LinkifiedText
                    text={entry.myAnswer}
                    onLinkClick={onWikiLinkClick}
                    existingTargets={existingTargets}
                  />
                </p>
              </div>
            )}
            {entry.correctAnswer && (
              <div className="answer-card answer-card--correct">
                <label>정답</label>
                <p>
                  <LinkifiedText
                    text={entry.correctAnswer}
                    onLinkClick={onWikiLinkClick}
                    existingTargets={existingTargets}
                  />
                </p>
              </div>
            )}
          </section>
        )}

        {!isFocusExpanded && hasExplanationContent(entry) && (
          <CollapsibleSection
            title="해설"
            badge={explanationBadge}
            defaultOpen={false}
          >
            <div className="explanation-parts-detail">
              {filledParts.map(({ part, index }) => (
                <div key={part.id} className="explanation-part-detail">
                  <h4 className="explanation-part-detail-title">
                    해설 {index + 1}
                  </h4>
                  <ContentBlock
                    text={part.text}
                    images={part.images}
                    variant="fill"
                    onWikiLinkClick={onWikiLinkClick}
                    existingTargets={existingTargets}
                  />
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {!isFocusExpanded && entry.memo.trim() && (
          <CollapsibleSection title="텍스트 메모" defaultOpen={false}>
            <div className="memo-content">
              <LinkifiedText
                text={entry.memo}
                onLinkClick={onWikiLinkClick}
                existingTargets={existingTargets}
              />
            </div>
          </CollapsibleSection>
        )}

        {isConcept && (
          <CollapsibleSection title="연결된 개념과 항목" badge={`${relatedEntries.length}개`} defaultOpen={false}>
            <ConceptGraph
              entries={allEntries}
              focusEntry={entry}
              onOpenEntry={(entryId) => onOpenEntry?.(entryId)}
            />
            {relatedEntries.length > 0 && (
              <div className="related-entry-list">
                {relatedEntries.map((related) => (
                  <button
                    key={related.id}
                    type="button"
                    className="related-entry"
                    onClick={() => onOpenEntry?.(related.id)}
                  >
                    <span>{related.title || "(제목 없음)"}</span>
                    <small>{related.subject}</small>
                  </button>
                ))}
              </div>
            )}
          </CollapsibleSection>
        )}
      </div>
      {isFocusExpanded && (
        <div className="focus-floating-controls" aria-label="집중 보기 빠른 조작">
          <button type="button" onClick={() => setFocusMode("mini")}>
            축소
          </button>
          <button
            type="button"
            onClick={() => cycleFocusTextSize(-1)}
            disabled={focusTextSize === "normal"}
          >
            글자 -
          </button>
          <button
            type="button"
            onClick={() => cycleFocusTextSize(1)}
            disabled={focusTextSize === "xlarge"}
          >
            글자 +
          </button>
          <button type="button" onClick={() => setFocusMode("closed")}>
            나가기
          </button>
        </div>
      )}
      {isFocusMini && (isSheet ? focusedQuestion : isWrongAnswer) && (
        <aside className="focus-mini-player" aria-label="축소된 문제 집중 보기">
          <button type="button" className="focus-mini-main" onClick={() => setFocusMode("expanded")}>
            <strong>{isSheet && focusedQuestion ? `문제 ${focusedQuestion.displayNumber}` : entry.title || "오답 집중 보기"}</strong>
            <span>{isSheet && focusedQuestion ? focusedQuestion.body.trim() || entry.title || "현재 문제" : entry.question.trim() || "현재 오답"}</span>
          </button>
          <div className="focus-mini-actions">
            <button type="button" onClick={() => setFocusMode("expanded")}>
              확대
            </button>
            {isSheet && (
              <button
                type="button"
                onClick={() => moveFocusedQuestion(1)}
                disabled={focusedQuestionIndex >= questionAnchors.length - 1}
              >
                다음
              </button>
            )}
            <button type="button" onClick={() => setFocusMode("closed")}>
              닫기
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
