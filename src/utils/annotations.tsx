import type { ReactNode } from "react";
import { v4 as uuidv4 } from "uuid";
import type {
  Annotation,
  AnnotationTool,
  ImageRectAnnotation,
  TextRangeAnnotation,
} from "../types";

export function renderAnnotatedText(
  text: string,
  annotations: TextRangeAnnotation[],
): ReactNode[] {
  const ranges = annotations
    .filter((a) => a.end > a.start)
    .sort((a, b) => a.start - b.start);

  if (!ranges.length) return [text];

  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const ann of ranges) {
    const start = Math.max(ann.start, cursor);
    const end = Math.min(ann.end, text.length);
    if (start > cursor) {
      nodes.push(text.slice(cursor, start));
    }
    if (end > start) {
      const slice = text.slice(start, end);
      nodes.push(
        <mark
          key={ann.id}
          className={`ann-${ann.tool}`}
          data-ann-id={ann.id}
        >
          {slice}
        </mark>,
      );
      cursor = end;
    }
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

export function getTextSelectionOffsets(
  container: HTMLElement,
  fullText: string,
): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;

  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const structured = getStructuredSelectionOffsets(range, container);
  if (structured) return structured;

  const pre = document.createRange();
  pre.selectNodeContents(container);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  const end = start + range.toString().length;

  if (start === end || end > fullText.length) return null;
  return { start, end };
}

function closestTextSegment(node: Node, root: HTMLElement): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  const segment = element?.closest("[data-text-start]");
  if (!segment || !root.contains(segment)) return null;
  return segment as HTMLElement;
}

function offsetWithinSegment(segment: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(segment);
  range.setEnd(node, offset);
  return range.toString().length;
}

function getStructuredSelectionOffsets(range: Range, root: HTMLElement) {
  const startSegment = closestTextSegment(range.startContainer, root);
  const endSegment = closestTextSegment(range.endContainer, root);
  if (!startSegment || !endSegment) return null;

  const startBase = Number(startSegment.dataset.textStart);
  const endBase = Number(endSegment.dataset.textStart);
  if (!Number.isFinite(startBase) || !Number.isFinite(endBase)) return null;

  const start = startBase + offsetWithinSegment(startSegment, range.startContainer, range.startOffset);
  const end = endBase + offsetWithinSegment(endSegment, range.endContainer, range.endOffset);

  if (start === end) return null;
  return start < end ? { start, end } : { start: end, end: start };
}

export function createTextAnnotation(
  start: number,
  end: number,
  tool: AnnotationTool,
): TextRangeAnnotation {
  return {
    id: uuidv4(),
    target: "question",
    kind: "text",
    start,
    end,
    tool,
  };
}

export function createImageAnnotation(
  imageId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  tool: AnnotationTool,
): ImageRectAnnotation {
  return {
    id: uuidv4(),
    target: "question",
    kind: "image",
    imageId,
    x,
    y,
    width,
    height,
    tool,
  };
}

export function filterQuestionAnnotations(annotations: Annotation[]) {
  return annotations.filter((a) => a.target === "question");
}
