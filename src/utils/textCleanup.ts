export function cleanQuestionText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s*(?=\n?\s*(?:문제\s*\d+|#\d+|\d{1,2}[.)]))/g, "\n")
    .replace(/\s*(?=\n?\s*(?:[①②③④⑤⑥⑦⑧⑨⑩]|(?:\(\d+\))|(?:[ㄱ-ㅎA-Ea-e][.)])))/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{2,}(?=\s*(?:문제\s*\d+|#\d+|\d{1,2}[.)]|[①②③④⑤⑥⑦⑧⑨⑩]|\(\d+\)|[ㄱ-ㅎA-Ea-e][.)]))/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
