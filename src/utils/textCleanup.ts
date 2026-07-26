export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

export function sanitizeControlCharacters(text: string): string {
  return [...text].filter((char) => char === "\n" || char === "\t" || char >= " ").join("");
}

export function normalizeQuestionLayout(text: string): string {
  return text
    .replace(/\s*(?=\n?\s*(?:문제\s*\d+|#\d+|\d{1,2}[.)]))/g, "\n")
    .replace(/\s*(?=\n?\s*(?:[①②③④⑤⑥⑦⑧⑨⑩]|(?:\(\d+\))|(?:[ㄱ-ㅎA-Ea-e][.)])))/g, "\n")
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
