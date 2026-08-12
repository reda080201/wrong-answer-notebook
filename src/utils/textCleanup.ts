export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

export function sanitizeControlCharacters(text: string): string {
  return [...text].filter((char) => char === "\n" || char === "\t" || char >= " ").join("");
}

export function normalizeQuestionLayout(text: string): string {
  // Markers only start a new line when they occur at a real whitespace boundary.
  // The former zero-width `\\s*` pattern split 10, 20, function arguments and
  // LaTex-like expressions in the middle of otherwise valid question text.
  const marker = "(?:문제\\s*\\d{1,3}|#\\d{1,3}|\\d{1,3}[.)]|[①②③④⑤⑥⑦⑧⑨⑩]|\\(\\d+\\)|[ㄱ-ㅎA-Ea-e][.)])";
  const markerBoundary = new RegExp(`[ \\t]+(?=${marker}(?:\\s|$))`, "g");
  return text
    .replace(markerBoundary, (whitespace, offset: number, source: string) => {
      const previous = source.slice(0, offset).trimEnd().at(-1);
      // `f(10, 20)` and comma-separated arithmetic are not question labels.
      return previous === "(" || previous === "," ? whitespace : "\n";
    })
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{2,}(?=\s*(?:문제\s*\d{1,3}|#\d{1,3}|\d{1,3}[.)]|[①②③④⑤⑥⑦⑧⑨⑩]|\(\d+\)|[ㄱ-ㅎA-Ea-e][.)]))/g, "\n");
}

export function cleanQuestionText(text: string): string {
  const normalized = normalizeLineEndings(sanitizeControlCharacters(text));
  return normalizeQuestionLayout(normalized)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export { detectSuspiciousTextSegments } from "./suspiciousText";
