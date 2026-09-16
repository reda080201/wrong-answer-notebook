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

function semanticText(segment: QuestionContentSegment): string {
  if (segment.type === "text") return normalizeText(segment.text);
  if (segment.type === "condition") {
    const parts = conditionParts(segment.label, segment.text);
    return normalizeText([parts.label, parts.text].filter(Boolean).join(" "));
  }
  if (segment.type === "equation") return normalizeLatex(segment.latex);
  return "";
}

function cloneSegment(segment: QuestionContentSegment): QuestionContentSegment {
  if (segment.type === "condition") {
    const parts = conditionParts(segment.label, segment.text);
    return { ...segment, label: parts.label || undefined, text: parts.text };
  }
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
  const canonicalText = source.map(semanticText).filter(Boolean).join(" ");
  const legacyText = normalizeText(input.questionText);
  const fallback: QuestionContentSegment[] = [
    ...(input.questionText.trim() ? [{ id: "question-text", type: "text" as const, text: input.questionText }] : []),
    ...input.conditions.filter((value) => value.trim()).map((text, index) => ({ id: `condition-${index + 1}`, type: "condition" as const, text })),
    ...input.equations.filter((value) => value.trim()).map((latex, index) => ({ id: `equation-${index + 1}`, type: "equation" as const, latex, display: true })),
  ];
  if (fallback[0]?.type === "text" && canonicalText && legacyText === canonicalText) {
    fallback.shift();
  }
  const canonicalLineKeys = new Set(source.map((segment) => semanticText(segment)).filter(Boolean));
  for (const segment of fallback) {
    if (segment.type === "text") {
      const lines = segment.text.split(/\r?\n/).map(normalizeText).filter(Boolean);
      if (lines.length > 1 && lines.every((line) => canonicalLineKeys.has(line))) continue;
      if (lines.length === 1 && canonicalLineKeys.has(lines[0])) continue;
    }
    const key = fingerprint(segment);
    if (!represented.has(key)) {
      source.push(segment);
      represented.add(key);
    }
  }
  return source;
}
