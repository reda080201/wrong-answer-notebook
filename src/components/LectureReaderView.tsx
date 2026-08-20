import { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { LectureBlockDefaultState, LectureBodyWidth, LectureDocument, LectureDocumentBlock, LectureLayout, LectureQuestionRelation, SheetFigureItem, WrongAnswerEntry } from "../types";
import { resolveFigureRepresentation } from "../features/figures/services/figureRepresentation";
import SemanticFigureView from "../features/figures/components/SemanticFigureView";
import DiagramCard from "./DiagramCard";
import ImageGallery from "./ImageGallery";
import LearningContentPanel from "./LearningContentPanel";
import MathText from "./MathText";
import FullscreenDialog from "../shared/ui/FullscreenDialog";
import { normalizeLegacyLectureMathForDisplay } from "../utils/legacyLectureMath";
import { getLectureDocument, getLectureHeadings } from "../utils/lectureDocument";
import { getEntryQuestions } from "../utils/entryQuestions";
import { consumeLectureWorkspaceFocus, loadLectureWorkspaceState, saveLectureWorkspaceState } from "../utils/lectureWorkspaceState";
import Dialog from "../shared/ui/Dialog";

interface LectureReaderViewProps {
  entry: WrongAnswerEntry;
  allEntries?: WrongAnswerEntry[];
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
  onOpenLinkedEntry?: (entryId: string) => void;
  onOpenLinkedQuestion?: (entryId: string, questionNumber: string) => void;
  onDocumentChange?: (document: LectureDocument) => Promise<void> | void;
  onRelationsChange?: (relations: LectureQuestionRelation[]) => Promise<void> | void;
  layout?: LectureLayout;
  onLayoutChange?: (layout: LectureLayout) => void;
  blockDefaultState?: LectureBlockDefaultState;
  bodyWidth?: LectureBodyWidth;
  onBodyWidthChange?: (width: LectureBodyWidth) => void;
}

interface LectureReaderContentProps extends LectureReaderViewProps {
  showFullscreen?: boolean;
  onRequestFullscreen?: () => void;
}

function blockLabel(type: string): string {
  if (type === "concept") return "핵심 개념";
  if (type === "formula") return "공식";
  if (type === "routine") return "루틴";
  if (type === "warning") return "주의";
  if (type === "review") return "복습";
  if (type === "diagram") return "시각화";
  return "학습";
}

function FigureContent({ figure }: { figure: SheetFigureItem }) {
  const representation = resolveFigureRepresentation(figure);
  if (representation.kind === "semantic_render" && figure.semanticSpec) {
    return <figure className="lecture-figure"><figcaption>{figure.title || "구조 도형"}</figcaption><SemanticFigureView spec={figure.semanticSpec} title={figure.title} /></figure>;
  }
  if (representation.kind === "described_only" || !representation.image) {
    return <aside className="question-described-figure"><strong>도표 설명</strong><p>{figure.caption || figure.title || "이미지 없이 설명만 제공됩니다."}</p></aside>;
  }
  return (
    <figure className="lecture-figure">
      <figcaption>{figure.title || "연결 도형"}{figure.caption ? ` · ${figure.caption}` : ""}</figcaption>
      <ImageGallery filenames={[representation.image]} variant="fill" />
    </figure>
  );
}

function lectureNavLabel(block: { title?: string; type?: string; content?: string }) {
  return block.title || (block.type ? blockLabel(block.type) : block.content || "학습 내용");
}

function DocumentBlockView({ block, index, open, onToggle, figures }: { block: LectureDocumentBlock; index: number; open: boolean; onToggle(open: boolean): void; figures: SheetFigureItem[] }) {
  const connectedFigure = block.figureId ? figures.find((figure) => figure.id === block.figureId) : undefined;
  const heading = block.type === "heading";
  return <details id={`lecture-block-${block.id}`} className={`lecture-block lecture-block--${block.type}`} open={open} onToggle={(event) => onToggle(event.currentTarget.open)}>
    <summary><span className="formula-chip">{heading ? "목차" : block.type}</span><h3>{heading ? block.content || "제목 없음" : `${index + 1}. ${block.content?.split("\n")[0] || "학습 내용"}`}</h3></summary>
    {block.type === "heading" ? null : block.content?.trim() ? <MathText text={normalizeLegacyLectureMathForDisplay(block.content)} /> : null}
    {connectedFigure ? <FigureContent figure={connectedFigure} /> : null}
  </details>;
}

function LectureReaderContent({
  entry,
  allEntries = [],
  onWikiLinkClick,
  existingTargets,
  onOpenLinkedEntry,
  onOpenLinkedQuestion,
  onDocumentChange,
  onRelationsChange,
  layout = "document",
  onLayoutChange,
  showFullscreen = true,
  onRequestFullscreen,
  blockDefaultState = "first",
  bodyWidth = "standard",
  onBodyWidthChange,
}: LectureReaderContentProps) {
  const legacyBlocks = useMemo(() => entry.learningBlocks ?? [], [entry.learningBlocks]);
  const document = useMemo(() => getLectureDocument(entry), [entry]);
  const documentHeadings = useMemo(() => getLectureHeadings(document), [document]);
  const blocks = entry.lectureDocument ? document.blocks : legacyBlocks;
  const [openBlockIds, setOpenBlockIds] = useState<Set<string>>(() => defaultOpenBlockIds(blocks, blockDefaultState));
  const restoredState = useMemo(() => loadLectureWorkspaceState(entry.id), [entry.id]);
  const [outlineOpen, setOutlineOpen] = useState(() => restoredState?.outlineOpen ?? true);
  const [relatedOpen, setRelatedOpen] = useState(() => restoredState?.relatedOpen ?? true);
  const [focusMode, setFocusMode] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [relationOpen, setRelationOpen] = useState(false);
  const [draftBlocks, setDraftBlocks] = useState<LectureDocumentBlock[]>(() => document.blocks.map((block) => ({ ...block, metadata: block.metadata ? { ...block.metadata } : undefined })));
  const [relationEntryId, setRelationEntryId] = useState("");
  const [relationQuestionNumber, setRelationQuestionNumber] = useState("");
  const [relationBlockId, setRelationBlockId] = useState("");
  const articleRef = useRef<HTMLElement>(null);
  const figures = entry.figures ?? [];
  const connectedFigureIds = new Set(entry.lectureDocument ? document.blocks.flatMap((block) => block.figureId ? [block.figureId] : []) : legacyBlocks.flatMap((block) => block.figureIds ?? []));
  const unlinkedFigures = figures.filter((figure) => !connectedFigureIds.has(figure.id));
  const overview = entry.question.trim();
  const memo = entry.memo.trim();
  const relationEntry = useMemo(
    () => allEntries.find((item) => item.id === relationEntryId),
    [allEntries, relationEntryId],
  );
  const relationQuestions = useMemo(
    () => relationEntry ? getEntryQuestions(relationEntry) : [],
    [relationEntry],
  );

  useEffect(() => {
    setOpenBlockIds(defaultOpenBlockIds(blocks, blockDefaultState));
  }, [blockDefaultState, blocks, entry.id]);

  useEffect(() => {
    const state = loadLectureWorkspaceState(entry.id);
    setOutlineOpen(state?.outlineOpen ?? true);
    setRelatedOpen(state?.relatedOpen ?? true);
    requestAnimationFrame(() => {
      if (articleRef.current && state?.scrollTop) articleRef.current.scrollTop = state.scrollTop;
    });
  }, [entry.id]);

  useEffect(() => {
    const target = consumeLectureWorkspaceFocus(entry.id);
    if (!target?.blockId) return;
    requestAnimationFrame(() => {
      document.getElementById(`lecture-block-${target.blockId}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }, [entry.id]);

  useEffect(() => {
    if (!focusMode) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setFocusMode(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusMode]);

  const updateWorkspaceState = (patch: Parameters<typeof saveLectureWorkspaceState>[1]) => {
    saveLectureWorkspaceState(entry.id, patch);
  };

  const saveDocument = async () => {
    if (!onDocumentChange) return;
    await onDocumentChange({ blocks: draftBlocks.map((block) => ({ ...block, metadata: block.metadata ? { ...block.metadata } : undefined })) });
    setEditorOpen(false);
  };

  const addRelation = async () => {
    if (!onRelationsChange || !relationEntryId || !relationQuestionNumber.trim()) return;
    const normalized = relationQuestionNumber.trim();
    const relations = [...(entry.lectureQuestionRelations ?? []), {
      id: uuidv4(),
      questionEntryId: relationEntryId,
      questionNumber: normalized,
      lectureBlockId: relationBlockId || undefined,
      createdAt: new Date().toISOString(),
    }];
    await onRelationsChange(relations);
    setRelationOpen(false); setRelationEntryId(""); setRelationQuestionNumber(""); setRelationBlockId("");
  };

  return (
    <>
    <div className={`lecture-workspace${focusMode ? " lecture-workspace--focus" : ""}`}>
      {outlineOpen && !focusMode && <aside className="lecture-outline-panel"><div className="lecture-panel-heading"><strong>목차</strong><button type="button" aria-label="목차 접기" onClick={() => { setOutlineOpen(false); updateWorkspaceState({ outlineOpen: false }); }}>‹</button></div><ol>{(entry.lectureDocument ? documentHeadings : legacyBlocks).map((block, index) => <li key={block.id}><a href={`#lecture-block-${block.id}`}>{index + 1}. {lectureNavLabel(block)}</a></li>)}</ol></aside>}
      <article ref={articleRef} onScroll={(event) => updateWorkspaceState({ scrollTop: event.currentTarget.scrollTop })} className={`lecture-reader lecture-reader--${layout} lecture-reader--width-${bodyWidth}`}>
      <header className="lecture-reader-cover">
        <div className="lecture-reader-toolbar">
          <span className="modal-eyebrow">Lecture Library</span>
          <div className="lecture-layout-toggle" role="group" aria-label="특강 보기 방식">
            <button type="button" className={layout === "document" ? "active" : ""} onClick={() => onLayoutChange?.("document")}>문서형</button>
            <button type="button" className={layout === "cards" ? "active" : ""} onClick={() => onLayoutChange?.("cards")}>카드형</button>
          </div>
          <div className="lecture-width-toggle" role="group" aria-label="본문 폭">{([['narrow', '좁게'], ['standard', '표준'], ['wide', '넓게'], ['full', '전체']] as const).map(([value, label]) => <button key={value} type="button" className={bodyWidth === value ? "active" : ""} aria-pressed={bodyWidth === value} onClick={() => onBodyWidthChange?.(value)}>{label}</button>)}</div>
          {showFullscreen && <button type="button" onClick={onRequestFullscreen} aria-label="특강 전체 화면">전체 화면</button>}
          <button type="button" onClick={() => setFocusMode((value) => !value)}>{focusMode ? "집중 읽기 해제" : "집중 읽기"}</button>
          <details className="lecture-more-menu"><summary>더보기</summary><div><button type="button" onClick={() => { setDraftBlocks(document.blocks.map((block) => ({ ...block, metadata: block.metadata ? { ...block.metadata } : undefined }))); setEditorOpen(true); }}>문서 편집</button><button type="button" onClick={() => setRelationOpen(true)}>문제 연결</button></div></details>
        </div>
        <h2>{entry.title.trim() || "특강자료"}</h2>
        <p>{entry.subject}{entry.sourceType ? ` · ${entry.sourceType.toUpperCase()}에서 변환` : ""}</p>
      </header>

      {overview && (
        <section className="lecture-overview" id="lecture-overview">
          <h3>특강 개요</h3>
          <MathText text={normalizeLegacyLectureMathForDisplay(overview)} />
        </section>
      )}
      {memo && (
        <section className="lecture-support-section" id="lecture-memo">
          <h3>복습 메모</h3>
          <MathText text={normalizeLegacyLectureMathForDisplay(memo)} />
        </section>
      )}

      {blocks.length > 0 && (
        <nav className="lecture-toc" aria-label="특강 목차">
          <strong>목차</strong>
          <div className="lecture-reader-actions">
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpenBlockIds(new Set(blocks.map((block) => block.id)))}>모두 펼치기</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setOpenBlockIds(new Set())}>모두 접기</button>
          </div>
          <ol>{(entry.lectureDocument ? documentHeadings : legacyBlocks).map((block, index) => <li key={block.id}><a href={`#lecture-block-${block.id}`}>{index + 1}. {lectureNavLabel(block)}</a></li>)}</ol>
        </nav>
      )}

      {entry.lectureDocument ? (
        <div className="lecture-reader-grid">
          {document.blocks.map((block, index) => <DocumentBlockView key={block.id} block={block} index={index} open={openBlockIds.has(block.id)} onToggle={(open) => setOpenBlockIds((current) => { const next = new Set(current); if (open) next.add(block.id); else next.delete(block.id); return next; })} figures={figures} />)}
        </div>
      ) : blocks.length > 0 ? (
        <div className="lecture-reader-grid">
          {legacyBlocks.map((block, index) => {
            const connectedFigures = figures.filter((figure) => (block.figureIds ?? []).includes(figure.id));
            return (
              <details
                key={block.id}
                id={`lecture-block-${block.id}`}
                className={`lecture-block lecture-block--${block.type}`}
                open={openBlockIds.has(block.id)}
                onToggle={(event) => {
                  const open = event.currentTarget.open;
                  setOpenBlockIds((current) => {
                    const next = new Set(current);
                    if (open) next.add(block.id); else next.delete(block.id);
                    return next;
                  });
                }}
              >
                <summary>
                  <span className="formula-chip">{blockLabel(block.type)}</span>
                  {block.sourceQuestionNumber && <span className="formula-chip">{block.sourceQuestionNumber}번</span>}
                  <h3>{index + 1}. {block.title || "학습 내용"}</h3>
                </summary>
                {block.content.trim() && <MathText text={normalizeLegacyLectureMathForDisplay(block.content)} />}
                {block.images?.length ? <ImageGallery filenames={block.images} variant="fill" /> : null}
                {connectedFigures.map((figure) => <FigureContent key={figure.id} figure={figure} />)}
                <DiagramCard diagramType={block.diagramType} diagramSpec={block.diagramSpec} />
              </details>
            );
          })}
        </div>
      ) : (
        <LearningContentPanel entry={entry} variant="main" onWikiLinkClick={onWikiLinkClick} existingTargets={existingTargets} />
      )}

      {(entry.concepts?.length ?? 0) > 0 && <section className="lecture-support-section"><h3>핵심 개념</h3><p>{entry.concepts?.join(" · ")}</p></section>}
      {(entry.checklist?.length ?? 0) > 0 && <section className="lecture-support-section"><h3>체크리스트</h3><ul>{entry.checklist?.map((item) => <li key={item.id}>{item.text}</li>)}</ul></section>}
      {(entry.questionImages?.length || entry.sourcePageImages?.length) ? (
        <section className="lecture-support-section" id="lecture-source-pages">
          <h3>원본 자료</h3>
          <ImageGallery filenames={[...new Set([...(entry.sourcePageImages ?? []), ...entry.questionImages])]} variant="fill" />
        </section>
      ) : null}
      {unlinkedFigures.length > 0 && <section className="lecture-support-section"><h3>추가 도형</h3>{unlinkedFigures.map((figure) => <FigureContent key={figure.id} figure={figure} />)}</section>}

      {(entry.linkedEntryIds?.length ?? 0) > 0 && (
        <section className="lecture-linked">
          <h3>연결 문제</h3>
          <div className="lecture-linked-actions">
            {entry.linkedEntryIds?.map((id) => <button key={id} type="button" onClick={() => onOpenLinkedEntry?.(id)}>연결 문제 보기</button>)}
          </div>
        </section>
      )}
      </article>
      {relatedOpen && !focusMode && <aside className="lecture-related-panel"><div className="lecture-panel-heading"><strong>관련 자료</strong><button type="button" aria-label="관련 자료 접기" onClick={() => { setRelatedOpen(false); updateWorkspaceState({ relatedOpen: false }); }}>›</button></div><h3>직접 연결</h3>{(entry.lectureQuestionRelations ?? []).map((relation) => <button type="button" className="lecture-related-row" key={relation.id} onClick={() => {
        if (onOpenLinkedQuestion) onOpenLinkedQuestion(relation.questionEntryId, relation.questionNumber);
        else onOpenLinkedEntry?.(relation.questionEntryId);
      }}>{relation.questionNumber}번 문제</button>)}{entry.linkedEntryIds?.filter((id) => !(entry.lectureQuestionRelations ?? []).some((relation) => relation.questionEntryId === id)).map((id) => <button type="button" className="lecture-related-row" key={id} onClick={() => onOpenLinkedEntry?.(id)}>연결 자료 열기</button>)}{!(entry.lectureQuestionRelations?.length || entry.linkedEntryIds?.length) && <p className="lecture-related-empty">연결된 자료가 없습니다.</p>}</aside>}
      {!outlineOpen && !focusMode && <button type="button" className="lecture-panel-restore lecture-panel-restore--left" onClick={() => { setOutlineOpen(true); updateWorkspaceState({ outlineOpen: true }); }}>목차</button>}
      {!relatedOpen && !focusMode && <button type="button" className="lecture-panel-restore lecture-panel-restore--right" onClick={() => { setRelatedOpen(true); updateWorkspaceState({ relatedOpen: true }); }}>관련 자료</button>}
    </div>
    <Dialog open={editorOpen} onClose={() => setEditorOpen(false)} ariaLabel="특강 문서 편집" size="xl">
      <header className="modal-head"><div><span className="modal-eyebrow">Lecture document</span><h2>문서 편집</h2></div></header>
      <div className="lecture-document-editor">
        {draftBlocks.map((block, index) => <section key={block.id} className="lecture-editor-block"><div className="lecture-editor-block-head"><strong>{index + 1}. {block.id}</strong><select aria-label={`${index + 1}번 block 유형`} value={block.type} onChange={(event) => setDraftBlocks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value as LectureDocumentBlock["type"] } : item))}>{["heading", "paragraph", "math", "image", "figure", "table", "quote", "callout", "example", "warning", "collapsible", "related_concept", "related_question"].map((type) => <option key={type} value={type}>{type}</option>)}</select><button type="button" disabled={index === 0} onClick={() => setDraftBlocks((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>위로</button><button type="button" disabled={index === draftBlocks.length - 1} onClick={() => setDraftBlocks((current) => { const next = [...current]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next; })}>아래로</button><button type="button" onClick={() => setDraftBlocks((current) => current.filter((_, itemIndex) => itemIndex !== index))}>삭제</button></div><textarea aria-label={`${index + 1}번 block 내용`} value={block.content ?? ""} onChange={(event) => setDraftBlocks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, content: event.target.value } : item))} /></section>)}
        <button type="button" className="btn-secondary" onClick={() => setDraftBlocks((current) => [...current, { id: uuidv4(), type: "paragraph", content: "" }])}>문단 추가</button>
      </div>
      <footer className="modal-actions"><button type="button" className="btn-secondary" onClick={() => setEditorOpen(false)}>취소</button><button type="button" className="btn-primary" onClick={() => void saveDocument()}>저장</button></footer>
    </Dialog>
    <Dialog open={relationOpen} onClose={() => setRelationOpen(false)} ariaLabel="특강 문제 연결" size="md">
      <header className="modal-head"><h2>직접 문제 연결</h2></header>
      <div className="lecture-relation-form"><label>문제지<select value={relationEntryId} onChange={(event) => { setRelationEntryId(event.target.value); setRelationQuestionNumber(""); }}><option value="">문제지를 선택하세요</option>{allEntries.filter((item) => item.entryKind === "problem_sheet").map((item) => <option key={item.id} value={item.id}>{item.title || "제목 없음"}</option>)}</select></label><label>문항 번호<select value={relationQuestionNumber} disabled={!relationEntryId} onChange={(event) => setRelationQuestionNumber(event.target.value)}><option value="">문항을 선택하세요</option>{relationQuestions.map((question) => <option key={question.questionNumber} value={question.questionNumber}>{question.questionNumber}번</option>)}</select></label><label>연결 위치<select value={relationBlockId} onChange={(event) => setRelationBlockId(event.target.value)}><option value="">특강 처음</option>{document.blocks.map((block) => <option key={block.id} value={block.id}>{lectureNavLabel(block)}</option>)}</select></label></div>
      <footer className="modal-actions"><button type="button" className="btn-secondary" onClick={() => setRelationOpen(false)}>취소</button><button type="button" className="btn-primary" disabled={!relationEntryId || !relationQuestionNumber.trim()} onClick={() => void addRelation()}>연결</button></footer>
    </Dialog>
    </>
  );
}

function defaultOpenBlockIds(
  blocks: Array<{ id: string }>,
  state: LectureBlockDefaultState,
) {
  if (state === "all") return new Set(blocks.map((block) => block.id));
  if (state === "first" && blocks[0]) return new Set([blocks[0].id]);
  return new Set<string>();
}

export default function LectureReaderView(props: LectureReaderViewProps) {
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const title = props.entry.title.trim() || "특강자료";

  return (
    <>
      <LectureReaderContent {...props} onRequestFullscreen={() => setFullscreenOpen(true)} />
      <FullscreenDialog
        open={fullscreenOpen}
        title={`${title} 전체 화면`}
        onClose={() => setFullscreenOpen(false)}
      >
        <div className="lecture-reader-fullscreen-content">
          <LectureReaderContent {...props} showFullscreen={false} />
        </div>
      </FullscreenDialog>
    </>
  );
}
