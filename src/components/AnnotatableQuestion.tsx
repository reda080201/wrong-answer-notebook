import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getImageUrl } from "../api";
import type { Annotation, AnnotationTool, SheetFigureItem, TextRangeAnnotation } from "../types";
import {
  createImageAnnotation,
  createTextAnnotation,
  filterQuestionAnnotations,
  getTextSelectionOffsets,
  renderAnnotatedText,
} from "../utils/annotations";
import {
  parseQuestionText,
  splitMarkdownTableSegments,
  type MarkdownTableSegment,
  type PassageBlock,
  type ParagraphBlock,
  type QuestionBodySegment as ParsedQuestionBodySegment,
  type QuestionBlock,
  type QuestionTextBlock,
} from "../utils/textLayout";
import { renderWikiLinksInNodes } from "../utils/wikiLinks";
import ImageGallery from "./ImageGallery";
import MathText, { renderMathInNodes } from "./MathText";
import ZoomableImageViewer from "./ZoomableImageViewer";

interface AnnotatableQuestionProps {
  question: string;
  questionImages: string[];
  figures?: SheetFigureItem[];
  annotations: Annotation[];
  memoMode: boolean;
  activeTool: AnnotationTool | "erase";
  onAnnotationsChange: (annotations: Annotation[]) => void;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
  sheetLayout?: "single" | "columns";
  searchQuery?: string;
  zoomableImages?: boolean;
}

interface FocusedQuestionViewProps {
  passage?: PassageBlock | ParagraphBlock;
  questionBlock: QuestionBlock;
  questionImages: string[];
  figures?: SheetFigureItem[];
  annotations: Annotation[];
  memoMode: boolean;
  activeTool: AnnotationTool | "erase";
  onAnnotationsChange: (annotations: Annotation[]) => void;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
  showImages: boolean;
}

interface QuestionBodySegment {
  kind: "body" | "condition" | "view";
  text: string;
  start: number;
  end: number;
  label?: string;
}

interface BodyLine {
  text: string;
  start: number;
  end: number;
  rawEnd: number;
}

function getBodyLines(text: string): BodyLine[] {
  const lines: BodyLine[] = [];
  const re = /.*(?:\r\n|\n|\r|$)/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match[0] === "" && match.index === text.length) break;
    const raw = match[0];
    const lineText = raw.replace(/\r?\n|\r$/, "");
    lines.push({
      text: lineText,
      start: match.index,
      end: match.index + lineText.length,
      rawEnd: match.index + raw.length,
    });
    if (re.lastIndex === text.length) break;
  }

  return lines;
}

function classifyBodyLine(line: string): QuestionBodySegment["kind"] {
  const trimmed = line.trim();
  if (/^<?\s*보기\s*>?$/.test(trimmed) || /^<[^>]{1,20}>$/.test(trimmed)) return "view";
  if (/^(조건|자료|제시문|그림|도표|그래프|표)\s*[:：]/.test(trimmed)) return "condition";
  return "body";
}

function splitQuestionBodySegments(text: string, absoluteStart: number): QuestionBodySegment[] {
  if (!text.trim()) return [];
  const lines = getBodyLines(text);
  const segments: Array<{ kind: QuestionBodySegment["kind"]; start: number; end: number }> = [];

  for (const line of lines) {
    const previous = segments.at(-1);
    const rawKind = line.text.trim() ? classifyBodyLine(line.text) : previous?.kind ?? "body";
    const kind =
      rawKind === "body" && (previous?.kind === "view" || previous?.kind === "condition")
        ? previous.kind
        : rawKind;
    if (previous && previous.kind === kind) {
      previous.end = line.rawEnd;
    } else {
      segments.push({ kind, start: line.start, end: line.rawEnd });
    }
  }

  return segments
    .map((segment) => {
      const rawText = text.slice(segment.start, segment.end);
      const leading = rawText.match(/^\s*/)?.[0].length ?? 0;
      const trailing = rawText.match(/\s*$/)?.[0].length ?? 0;
      const start = segment.start + leading;
      const end = Math.max(start, segment.end - trailing);
      return {
        kind: segment.kind,
        text: text.slice(start, end),
        start: absoluteStart + start,
        end: absoluteStart + end,
      };
    })
    .filter((segment) => segment.text.trim());
}

function parsedBodySegments(block: QuestionBlock): QuestionBodySegment[] {
  return (block.bodySegments ?? []).map((segment: ParsedQuestionBodySegment) => ({
    kind: segment.kind,
    text: segment.text,
    start: segment.start,
    end: segment.end,
    label: segment.label,
  }));
}

function questionBodySegmentsForBlock(block: QuestionBlock): QuestionBodySegment[] {
  return block.bodySegments?.length
    ? parsedBodySegments(block)
    : splitQuestionBodySegments(block.body, block.bodyStart);
}

function clipTextAnnotations(
  annotations: TextRangeAnnotation[],
  start: number,
  end: number,
): TextRangeAnnotation[] {
  return annotations
    .filter((ann) => ann.end > start && ann.start < end)
    .map((ann) => ({
      ...ann,
      start: Math.max(ann.start, start) - start,
      end: Math.min(ann.end, end) - start,
    }));
}

function StructuredTextSegment({
  text,
  start,
  annotations,
  className,
  onWikiLinkClick,
  existingTargets,
  searchQuery,
}: {
  text: string;
  start: number;
  annotations: TextRangeAnnotation[];
  className?: string;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
  searchQuery?: string;
}) {
  const nodes = annotations.length > 0
    ? renderAnnotatedText(text, annotations)
    : [text];

  if (annotations.length === 0) {
    const segments = splitMarkdownTableSegments(text);
    if (segments.some((segment) => typeof segment !== "string")) {
      return (
        <div className={className} data-text-start={start}>
          {segments.map((segment, index) =>
            typeof segment === "string" ? (
              <span key={`text-${index}`}>
                {renderMathInNodes(highlightSearchNodes(
                  renderWikiLinksInNodes([segment], onWikiLinkClick, existingTargets),
                  searchQuery,
                ))}
              </span>
            ) : (
              <MarkdownTable key={`table-${index}`} table={segment} />
            ),
          )}
        </div>
      );
    }
  }

  return (
    <span className={className} data-text-start={start}>
      {renderMathInNodes(highlightSearchNodes(
        renderWikiLinksInNodes(nodes, onWikiLinkClick, existingTargets),
        searchQuery,
      ))}
    </span>
  );
}

function MarkdownTable({ table }: { table: MarkdownTableSegment }) {
  const [head, ...body] = table.rows;
  return (
    <table className="question-markdown-table">
      <thead>
        <tr>
          {head.map((cell, index) => (
            <th key={`${cell}-${index}`}><MathText text={cell} /></th>
          ))}
        </tr>
      </thead>
      <tbody>
        {body.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td key={`${cell}-${cellIndex}`}><MathText text={cell} /></td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function highlightSearchNodes(nodes: ReactNode[], query?: string): ReactNode[] {
  const needle = query?.trim();
  if (!needle) return nodes;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(${escaped})`, "gi");

  return nodes.flatMap((node, nodeIndex) => {
    if (typeof node !== "string") return node;
    const parts = node.split(pattern);
    return parts.map((part, partIndex) =>
      part.toLowerCase() === needle.toLowerCase() ? (
        <mark key={`${nodeIndex}-${partIndex}`} className="question-search-mark">
          {part}
        </mark>
      ) : (
        part
      ),
    );
  });
}

function StructuredQuestionBlock({
  block,
  textAnnotations,
  figures,
  onWikiLinkClick,
  existingTargets,
  searchQuery,
}: {
  block: QuestionTextBlock;
  textAnnotations: TextRangeAnnotation[];
  figures: SheetFigureItem[];
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
  searchQuery?: string;
}) {
  if (block.kind === "passage" || block.kind === "paragraph") {
    return (
      <section className={`question-text-block question-text-block--${block.kind}`}>
        <StructuredTextSegment
          text={block.text}
          start={block.start}
          annotations={clipTextAnnotations(textAnnotations, block.start, block.end)}
          onWikiLinkClick={onWikiLinkClick}
          existingTargets={existingTargets}
          searchQuery={searchQuery}
        />
      </section>
    );
  }

  const matchedFigures = figures.filter((figure) => figureMatchesQuestion(figure, block));
  const bodySegments = questionBodySegmentsForBlock(block);

  return (
    <section
      id={`sheet-question-${block.start}`}
      className="question-text-block question-text-block--question"
    >
      <div className="question-number">
        <span className="question-number-main" data-number={block.displayNumber}>{block.displayNumber}</span>
        {normalizeNumberLabel(block.numberLabel) !== String(block.displayNumber) && (
          <small>원문 {block.numberLabel}</small>
        )}
      </div>
      <QuestionBodySegments
        segments={bodySegments}
        textAnnotations={textAnnotations}
        onWikiLinkClick={onWikiLinkClick}
        existingTargets={existingTargets}
        searchQuery={searchQuery}
      />
      {block.choices.length > 0 && (
        <ol className="question-choices">
          {block.choices.map((choice) => (
            <li key={`${choice.start}-${choice.end}`} className="question-choice">
              <span className="question-choice-marker" aria-hidden="true">
                {choice.marker}
              </span>
              <StructuredTextSegment
                text={choice.text}
                start={choice.start}
                annotations={clipTextAnnotations(textAnnotations, choice.start, choice.end)}
                onWikiLinkClick={onWikiLinkClick}
                existingTargets={existingTargets}
                searchQuery={searchQuery}
              />
            </li>
          ))}
        </ol>
      )}
      {matchedFigures.length > 0 && <FigureList figures={matchedFigures} />}
    </section>
  );
}

function QuestionBodySegments({
  segments,
  textAnnotations,
  onWikiLinkClick,
  existingTargets,
  searchQuery,
}: {
  segments: QuestionBodySegment[];
  textAnnotations: TextRangeAnnotation[];
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
  searchQuery?: string;
}) {
  if (!segments.length) return null;
  return (
    <div className="question-body">
      {segments.map((segment) => (
        <section
          key={`${segment.kind}-${segment.start}-${segment.end}`}
          className={`question-body-segment question-body-segment--${segment.kind}`}
        >
          {segment.kind !== "body" && (
            <div className="question-body-segment-title">
              <span />
              <strong>{segment.kind === "view" ? "<보기>" : segment.label || "조건"}</strong>
              <span />
            </div>
          )}
          <StructuredTextSegment
            text={segment.text}
            start={segment.start}
            annotations={clipTextAnnotations(textAnnotations, segment.start, segment.end)}
            onWikiLinkClick={onWikiLinkClick}
            existingTargets={existingTargets}
            searchQuery={searchQuery}
          />
        </section>
      ))}
    </div>
  );
}

function normalizeNumberLabel(label: string): string {
  return label.replace(/^#/, "").replace(/^0+/, "") || label;
}

function figureMatchesQuestion(figure: SheetFigureItem, block: QuestionBlock): boolean {
  const normalized = normalizeNumberLabel(figure.questionNumber);
  return normalized === String(block.displayNumber) || normalized === normalizeNumberLabel(block.numberLabel);
}

function FigureList({ figures }: { figures: SheetFigureItem[] }) {
  return (
    <div className="sheet-figure-list">
      {figures.map((figure) => (
        <figure key={figure.id} className="sheet-figure-card">
          <figcaption>
            <strong>{figure.title || "GPT 정리 도표"}</strong>
            <span>{figure.source === "original" ? "원본 첨부" : "GPT 정리 이미지"}</span>
            {figure.needsReview && <small className="answer-review-badge">검토 필요</small>}
          </figcaption>
          {figure.caption && <p>{figure.caption}</p>}
          {figure.image ? (
            <ImageGallery filenames={[figure.image]} variant="fill" />
          ) : (
            <div className="image-fill-error">연결된 이미지가 없습니다</div>
          )}
        </figure>
      ))}
    </div>
  );
}

function shouldShowSourceNumber(block: QuestionBlock): boolean {
  return normalizeNumberLabel(block.numberLabel) !== String(block.displayNumber);
}

export function FocusedQuestionView({
  passage,
  questionBlock,
  questionImages,
  figures = [],
  annotations,
  memoMode,
  activeTool,
  onAnnotationsChange,
  onWikiLinkClick,
  existingTargets,
  showImages,
}: FocusedQuestionViewProps) {
  const questionAnns = filterQuestionAnnotations(annotations);
  const textAnns = questionAnns.filter(
    (a): a is Extract<Annotation, { kind: "text" }> => a.kind === "text",
  );
  const matchedFigures = figures.filter((figure) => figureMatchesQuestion(figure, questionBlock));
  const bodySegments = questionBodySegmentsForBlock(questionBlock);
  const focusImageFilenames = [
    ...matchedFigures.flatMap((figure) => figure.image ? [figure.image] : []),
    ...questionImages,
  ].filter((filename, index, values) => values.indexOf(filename) === index);

  return (
    <article className="focused-question-view">
      {passage && (
        <section className="focused-passage">
          <span className="focused-section-label">지문</span>
          <StructuredTextSegment
            text={passage.text}
            start={passage.start}
            annotations={clipTextAnnotations(textAnns, passage.start, passage.end)}
            onWikiLinkClick={onWikiLinkClick}
            existingTargets={existingTargets}
          />
        </section>
      )}

      <section className="focused-question-card" id={`sheet-question-${questionBlock.start}`}>
        <header className="focused-question-header">
          <div>
            <span className="focused-section-label">문제</span>
            <h3>
              문제 {questionBlock.displayNumber}
              {shouldShowSourceNumber(questionBlock) && (
                <small>원문 {questionBlock.numberLabel}</small>
              )}
            </h3>
          </div>
        </header>

        <div className="focused-question-body">
          <QuestionBodySegments
            segments={bodySegments}
            textAnnotations={textAnns}
            onWikiLinkClick={onWikiLinkClick}
            existingTargets={existingTargets}
          />
        </div>

        {questionBlock.choices.length > 0 && (
          <ol className="focused-question-choices">
            {questionBlock.choices.map((choice) => (
              <li key={`${choice.start}-${choice.end}`} className="focused-question-choice">
                <span className="focused-choice-marker" aria-hidden="true">
                  {choice.marker}
                </span>
                <StructuredTextSegment
                  text={choice.text}
                  start={choice.start}
                  annotations={clipTextAnnotations(textAnns, choice.start, choice.end)}
                  onWikiLinkClick={onWikiLinkClick}
                  existingTargets={existingTargets}
                />
              </li>
            ))}
          </ol>
        )}
        {matchedFigures.length > 0 && <FigureList figures={matchedFigures} />}
      </section>

      {showImages && focusImageFilenames.length > 0 && (
        <section className="focused-image-panel">
          <span className="focused-section-label">첨부 이미지</span>
          <ZoomableImageViewer filenames={focusImageFilenames} />
          <div className="image-gallery--fill">
            {questionImages.map((filename) => (
              <AnnotatableImage
                key={filename}
                filename={filename}
                annotations={questionAnns}
                memoMode={memoMode}
                activeTool={activeTool}
                allAnnotations={annotations}
                onAnnotationsChange={onAnnotationsChange}
              />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

function StructuredQuestionText({
  question,
  textAnnotations,
  sheetLayout,
  figures,
  onWikiLinkClick,
  existingTargets,
  searchQuery,
}: {
  question: string;
  textAnnotations: TextRangeAnnotation[];
  sheetLayout: "single" | "columns";
  figures: SheetFigureItem[];
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
  searchQuery?: string;
}) {
  const blocks = useMemo(() => parseQuestionText(question), [question]);
  const className = `structured-question-text structured-question-text--${sheetLayout}`;

  return (
    <div className={className}>
      {blocks.map((block) => (
        <StructuredQuestionBlock
          key={`${block.kind}-${block.start}-${block.end}`}
          block={block}
          textAnnotations={textAnnotations}
          figures={figures}
          onWikiLinkClick={onWikiLinkClick}
          existingTargets={existingTargets}
          searchQuery={searchQuery}
        />
      ))}
    </div>
  );
}

function AnnotatableImage({
  filename,
  annotations,
  memoMode,
  activeTool,
  onAnnotationsChange,
  allAnnotations,
}: {
  filename: string;
  annotations: Annotation[];
  memoMode: boolean;
  activeTool: AnnotationTool | "erase";
  onAnnotationsChange: (next: Annotation[]) => void;
  allAnnotations: Annotation[];
}) {
  const [src, setSrc] = useState("");
  const [imageError, setImageError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc("");
    setImageError(false);
    getImageUrl(filename)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setImageError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [filename]);

  const imgAnnotations = annotations.filter(
    (a): a is Extract<Annotation, { kind: "image" }> =>
      a.kind === "image" && a.imageId === filename,
  );

  const toNorm = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!memoMode || activeTool === "erase") return;
    const { x, y } = toNorm(e.clientX, e.clientY);
    startRef.current = { x, y };
    setDrawing({ x, y, w: 0, h: 0 });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!startRef.current || !drawing) return;
    const { x: x2, y: y2 } = toNorm(e.clientX, e.clientY);
    const x = Math.min(startRef.current.x, x2);
    const y = Math.min(startRef.current.y, y2);
    const w = Math.abs(x2 - startRef.current.x);
    const h = Math.abs(y2 - startRef.current.y);
    setDrawing({ x, y, w, h });
  };

  const finishDraw = () => {
    if (!drawing || !startRef.current) {
      setDrawing(null);
      startRef.current = null;
      return;
    }
    if (drawing.w > 0.01 && drawing.h > 0.01 && activeTool !== "erase") {
      const ann = createImageAnnotation(
        filename,
        drawing.x,
        drawing.y,
        drawing.w,
        drawing.h,
        activeTool,
      );
      onAnnotationsChange([...allAnnotations, ann]);
    }
    setDrawing(null);
    startRef.current = null;
  };

  const handleEraseClick = (annId: string) => {
    if (memoMode && activeTool === "erase") {
      onAnnotationsChange(allAnnotations.filter((a) => a.id !== annId));
    }
  };

  if (imageError) {
    return <div className="image-fill-error">이미지를 불러올 수 없습니다</div>;
  }

  if (!src) return <div className="image-fill-loading" />;

  return (
    <div
      ref={containerRef}
      className={`image-fill-wrap ${memoMode ? "memo-active" : ""}`}
    >
      <img
        src={src}
        alt="문제 이미지"
        className="image-fill-img"
        draggable={false}
        loading="lazy"
      />
      {imgAnnotations.map((ann) => (
        <div
          key={ann.id}
          className={`image-ann image-ann--${ann.tool}`}
          style={{
            left: `${ann.x * 100}%`,
            top: `${ann.y * 100}%`,
            width: `${ann.width * 100}%`,
            height: `${ann.height * 100}%`,
          }}
          onClick={() => handleEraseClick(ann.id)}
        />
      ))}
      {drawing && activeTool !== "erase" && (
        <div
          className={`image-ann image-ann--${activeTool} image-ann--draft`}
          style={{
            left: `${drawing.x * 100}%`,
            top: `${drawing.y * 100}%`,
            width: `${drawing.w * 100}%`,
            height: `${drawing.h * 100}%`,
          }}
        />
      )}
      {memoMode && activeTool !== "erase" && (
        <div
          className="image-draw-layer"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDraw}
          onPointerLeave={finishDraw}
        />
      )}
    </div>
  );
}

export default function AnnotatableQuestion({
  question,
  questionImages,
  figures = [],
  annotations,
  memoMode,
  activeTool,
  onAnnotationsChange,
  onWikiLinkClick,
  existingTargets,
  sheetLayout = "single",
  searchQuery,
  zoomableImages = false,
}: AnnotatableQuestionProps) {
  const textRef = useRef<HTMLDivElement>(null);
  const questionAnns = filterQuestionAnnotations(annotations);
  const textAnns = questionAnns.filter(
    (a): a is Extract<Annotation, { kind: "text" }> => a.kind === "text",
  );

  const applyTextAnnotation = useCallback(() => {
    if (!memoMode || activeTool === "erase" || !textRef.current || !question.trim())
      return;
    const offsets = getTextSelectionOffsets(textRef.current, question);
    if (!offsets) return;
    const ann = createTextAnnotation(offsets.start, offsets.end, activeTool);
    onAnnotationsChange([...annotations, ann]);
    window.getSelection()?.removeAllRanges();
  }, [memoMode, activeTool, question, annotations, onAnnotationsChange]);

  const handleTextClick = (e: React.MouseEvent) => {
    if (!memoMode || activeTool !== "erase") return;
    const target = (e.target as HTMLElement).closest("[data-ann-id]");
    if (target) {
      const id = target.getAttribute("data-ann-id");
      if (id) onAnnotationsChange(annotations.filter((a) => a.id !== id));
    }
  };

  const hasText = Boolean(question.trim());
  const hasImages = questionImages.length > 0;

  if (!hasText && !hasImages) return null;

  return (
    <div className={`annotatable-question ${memoMode ? "memo-mode" : ""}`}>
      {hasText && (
        <div
          ref={textRef}
          className="content-block-text annotatable-text"
          onMouseUp={applyTextAnnotation}
          onClick={handleTextClick}
        >
          <StructuredQuestionText
            question={question}
            textAnnotations={textAnns}
            sheetLayout={sheetLayout}
            figures={figures}
            onWikiLinkClick={onWikiLinkClick}
            existingTargets={existingTargets}
            searchQuery={searchQuery}
          />
        </div>
      )}
      {hasImages && (
        <>
          {zoomableImages && <ZoomableImageViewer filenames={questionImages} />}
          <div className="image-gallery--fill">
            {questionImages.map((f) => (
              <AnnotatableImage
                key={f}
                filename={f}
                annotations={questionAnns}
                memoMode={memoMode}
                activeTool={activeTool}
                allAnnotations={annotations}
                onAnnotationsChange={onAnnotationsChange}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
