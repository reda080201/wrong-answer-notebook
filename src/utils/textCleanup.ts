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

export function detectSuspiciousTextSegments(text: string): Array<{ start: number; end: number; text: string; reason: string }> {
  const segments: Array<{ start: number; end: number; text: string; reason: string }> = [];
  const patterns = [
    { regex: /[가-힣]{1,2}(?:죳|쫏|뭇|쀍)[가-힣]*/g, reason: "OCR 의심 한글 조합" },
    { regex: /(?:[^\s가-힣A-Za-z0-9]){5,}/g, reason: "기호가 과도하게 섞인 구간" },
    { regex: /(?:[ㄱ-ㅎㅏ-ㅣ]){3,}/g, reason: "의미 없는 자모 반복" },
  ];
  for (const { regex, reason } of patterns) {
    for (const match of text.matchAll(regex)) {
      const start = match.index ?? 0;
      segments.push({ start, end: start + match[0].length, text: match[0], reason });
    }
  }
  return segments.sort((a, b) => a.start - b.start);
}

export function cleanQuestionText(text: string): string {
  const normalized = normalizeLineEndings(sanitizeControlCharacters(text));
  return normalizeQuestionLayout(normalized)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
