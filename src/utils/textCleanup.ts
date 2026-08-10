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
  return text
    .replace(/[ \t]+(?=(?:문제\s*\d+|#\d+|\d{1,2}[.)]|[①②③④⑤⑥⑦⑧⑨⑩]|\(\d+\)|[ㄱ-ㅎA-Ea-e][.)])(?:\s|$))/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{2,}(?=\s*(?:문제\s*\d+|#\d+|\d{1,2}[.)]|[①②③④⑤⑥⑦⑧⑨⑩]|\(\d+\)|[ㄱ-ㅎA-Ea-e][.)]))/g, "\n");
}

export function cleanQuestionText(text: string): string {
  const normalized = normalizeLineEndings(sanitizeControlCharacters(text));
  return normalizeQuestionLayout(normalized)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export { detectSuspiciousTextSegments } from "./suspiciousText";
