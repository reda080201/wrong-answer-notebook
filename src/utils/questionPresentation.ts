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
  if (segment.type === "condition") {
    const parts = conditionParts(segment.label, segment.text);
    return { ...segment, label: parts.label || undefined, text: parts.text };
  }
  return segment.type === "table" ? { ...segment, rows: segment.rows.map((row) => [...row]) } : { ...segment };
}

function removeExactRepresentedFragments(value: string, fragments: string[]): string {
  let remaining = value;
  for (const fragment of fragments) {
    const normalized = normalizeText(fragment);
    if (!normalized) continue;
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    remaining = remaining.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "g"), " ");
  }
  return normalizeText(remaining);
}

function representedFragmentsForSegment(segment: QuestionContentSegment): string[] {
  if (segment.type === "condition") {
    const parts = conditionParts(segment.label, segment.text);
    return [parts.label ? `${parts.label} ${parts.text}` : parts.text].filter(Boolean);
  }
  if (segment.type === "equation") {
    const latex = normalizeLatex(segment.latex);
    return [latex, `\\(${latex}\\)`, `\\[${latex}\\]`];
  }
  return segment.type === "text" ? normalizedLines(segment.text) : [];
}

function insertLegacyLineNearExactAnchor(source: QuestionContentSegment[], line: string): boolean {
  const normalized = normalizeText(line);
  if (!normalized) return false;
  for (const fragment of source.flatMap(representedFragmentsForSegment)) {
    const anchorMatches = source.filter((segment) => representedFragmentsForSegment(segment).includes(fragment));
    if (anchorMatches.length !== 1) continue;
    const fragmentText = normalizeText(fragment);
    const prefix = `${fragmentText} `;
    const suffix = ` ${fragmentText}`;
    const anchorIndex = source.indexOf(anchorMatches[0]);
    if (normalized.startsWith(prefix)) {
      source.splice(anchorIndex + 1, 0, { id: `legacy-${anchorIndex}-after`, type: "text", text: normalized.slice(prefix.length) });
      return true;
    }
    if (normalized.endsWith(suffix)) {
      source.splice(anchorIndex, 0, { id: `legacy-${anchorIndex}-before`, type: "text", text: normalized.slice(0, -suffix.length) });
      return true;
    }
  }
  return false;
}

function normalizedLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map(normalizeText)
    .filter(Boolean);
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
  const representedLines = new Set(source.flatMap((segment) => {
    if (segment.type === "text") return normalizedLines(segment.text);
    if (segment.type === "condition") {
      const parts = conditionParts(segment.label, segment.text);
      return [parts.label ? `${parts.label} ${parts.text}` : parts.text];
    }
    if (segment.type === "equation") return [normalizeLatex(segment.latex), `\\(${normalizeLatex(segment.latex)}\\)`, `\\[${normalizeLatex(segment.latex)}\\]`];
    return [];
  }).map(normalizeText).filter(Boolean));
  // A labelled condition is one semantic unit. Its body must not be removed
  // independently from legacy prose, or a matching condition can leave only
  // an orphan label behind.
  const representedFragments = source.flatMap((segment) => {
    if (segment.type === "condition") {
      const parts = conditionParts(segment.label, segment.text);
      return [parts.label ? `${parts.label} ${parts.text}` : parts.text];
    }
    if (segment.type === "equation") {
      const latex = normalizeLatex(segment.latex);
      return [latex, `\\(${latex}\\)`, `\\[${latex}\\]`];
    }
    return segment.type === "text" ? normalizedLines(segment.text) : [];
  }).filter(Boolean);
  const legacyText = normalizeText(input.questionText);
  const fallback: QuestionContentSegment[] = [
    ...(input.questionText.trim() ? [{ id: "question-text", type: "text" as const, text: input.questionText }] : []),
    ...input.conditions.filter((value) => value.trim()).map((text, index) => ({ id: `condition-${index + 1}`, type: "condition" as const, text })),
    ...input.equations.filter((value) => value.trim()).map((latex, index) => ({ id: `equation-${index + 1}`, type: "equation" as const, latex, display: true })),
  ];
  if (fallback[0]?.type === "text" && canonicalText && legacyText === canonicalText) {
    fallback.shift();
  }
  for (const segment of fallback) {
    if (segment.type === "text") {
      const lines = normalizedLines(segment.text);
      if (lines.length > 1) {
        for (const line of lines) {
          if (representedLines.has(line)) continue;
          if (!insertLegacyLineNearExactAnchor(source, line)) source.push({ ...segment, text: line });
        }
        continue;
      }
      const remaining = removeExactRepresentedFragments(segment.text, representedFragments);
      if (!remaining || (canonicalText && normalizeText(segment.text) === canonicalText)) continue;
      source.push({ ...segment, text: remaining });
      continue;
    }
    const key = fingerprint(segment);
    if (!represented.has(key)) {
      source.push(segment);
      represented.add(key);
    }
  }
  return source;
}
