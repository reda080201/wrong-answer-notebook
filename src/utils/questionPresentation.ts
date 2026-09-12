import type { QuestionContentSegment } from "../types";

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLatex(value: string): string {
  return normalizeText(value).replace(/^\\\[/, "").replace(/\\\]$/, "").replace(/^\\\(/, "").replace(/\\\)$/, "");
}

function conditionParts(label: string | undefined, text: string): { label: string; text: string } {
  const value = normalizeText(text);
  const leading = value.match(/^(\([가-힣]\)|[가-힣][.)])\s*/)?.[1] ?? "";
  return {
    label: normalizeText(label ?? leading),
    text: normalizeText(leading ? value.slice(leading.length) : value),
  };
}

function fingerprint(segment: QuestionContentSegment): string {
  if (segment.type === "text") return `text:${normalizeText(segment.text)}`;
  if (segment.type === "condition") {
    const parts = conditionParts(segment.label, segment.text);
    return `condition:${parts.label}:${parts.text}`;
  }
  if (segment.type === "equation") return `equation:${normalizeLatex(segment.latex)}`;
  if (segment.type === "figure") return `figure:${segment.figureId}`;
  return `table:${segment.rows.map((row) => row.map(normalizeText).join("|")).join(";")}`;
}

function cloneSegment(segment: QuestionContentSegment): QuestionContentSegment {
  return segment.type === "table" ? { ...segment, rows: segment.rows.map((row) => [...row]) } : { ...segment };
}

/**
 * Preserves the canonical stream, then supplements only semantic values that
 * are absent from it. Dedupe is deliberately cross-representation: repeated
 * entries inside the ordered stream remain meaningful and are never removed.
 */
export function normalizeQuestionPresentationSegments(input: {
  questionText: string;
  conditions: string[];
  equations: string[];
  contentSegments?: QuestionContentSegment[];
}): QuestionContentSegment[] {
  const hasCanonicalStream = Boolean(input.contentSegments?.length);
  const source = hasCanonicalStream ? input.contentSegments!.map(cloneSegment) : [];
  const represented = new Set(source.map(fingerprint));
  const canonicalText = source
    .filter((segment): segment is Extract<QuestionContentSegment, { type: "text" }> => segment.type === "text")
    .map((segment) => normalizeText(segment.text))
    .filter(Boolean)
    .join(" ");
  const fallback: QuestionContentSegment[] = [
    ...(input.questionText.trim() ? [{ id: "question-text", type: "text" as const, text: input.questionText }] : []),
    ...input.conditions.filter((value) => value.trim()).map((text, index) => ({ id: `condition-${index + 1}`, type: "condition" as const, text })),
    ...input.equations.filter((value) => value.trim()).map((latex, index) => ({ id: `equation-${index + 1}`, type: "equation" as const, latex, display: true })),
  ];
  for (const segment of fallback) {
    if (segment.type === "text" && canonicalText && normalizeText(segment.text) === canonicalText) continue;
    const key = fingerprint(segment);
    if (!represented.has(key)) {
      source.push(segment);
      represented.add(key);
    }
  }
  return source;
}
