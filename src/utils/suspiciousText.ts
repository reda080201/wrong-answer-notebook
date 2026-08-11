export interface SuspiciousTextSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  reason: string;
  severity: "low" | "medium" | "high";
}

const KNOWN_OCR_FRAGMENTS = [
  "밀죳",
  "에 대하여 함수",
  "됬",
  "ㅁㅁ",
  "□□",
  "�",
];

function symbolRatio(text: string): number {
  const trimmed = text.replace(/\s/g, "");
  if (!trimmed) return 0;
  const symbols = trimmed.match(/[^\p{L}\p{N}\s①-⑤㉠-㉤ㄱ-ㅎ가-힣.,!?()[\]{}<>+\-*/=≤≥:;'"%]/gu)?.length ?? 0;
  return symbols / trimmed.length;
}

function hasOddNonAsciiCharacter(line: string): boolean {
  return Array.from(line).some((ch) => {
    if (ch.charCodeAt(0) <= 127) return false;
    return !/[가-힣ㄱ-ㅎㅏ-ㅣ①-⑤㉠-㉤Ⅰ-Ⅻ≤≥±×÷√π∞∑∫≠≦≧·…""''—–-]/u.test(ch);
  });
}

function isMathOrEquationLine(line: string): boolean {
  const trimmed = line.trim();
  return /\\(?:frac|sqrt|sum|int|left|right|begin|end)\b/.test(trimmed)
    || /^[\d\s+\-*/=()\[\]{}.,:;<>≤≥±×÷√π∞∑∫^_\\a-zA-Z]+$/u.test(trimmed);
}

function addSegment(
  segments: SuspiciousTextSegment[],
  source: string,
  start: number,
  end: number,
  reason: string,
  severity: SuspiciousTextSegment["severity"] = "medium",
) {
  const safeStart = Math.max(0, Math.min(source.length, start));
  const safeEnd = Math.max(safeStart, Math.min(source.length, end));
  const text = source.slice(safeStart, safeEnd).trim();
  if (!text) return;
  if (segments.some((item) => Math.abs(item.start - safeStart) <= 2 && item.reason === reason)) return;
  segments.push({
    id: `${reason}-${safeStart}-${safeEnd}`,
    start: safeStart,
    end: safeEnd,
    text,
    reason,
    severity,
  });
}

export function detectSuspiciousTextSegments(question: string): SuspiciousTextSegment[] {
  const segments: SuspiciousTextSegment[] = [];
  if (!question.trim()) return segments;

  for (const fragment of KNOWN_OCR_FRAGMENTS) {
    let index = question.indexOf(fragment);
    while (index >= 0) {
      addSegment(segments, question, index, index + fragment.length, "OCR 의심 조각", "high");
      index = question.indexOf(fragment, index + fragment.length);
    }
  }

  const repeated = /([가-힣ㄱ-ㅎ])\1{2,}/gu;
  let repeatedMatch: RegExpExecArray | null;
  while ((repeatedMatch = repeated.exec(question)) !== null) {
    addSegment(
      segments,
      question,
      repeatedMatch.index,
      repeatedMatch.index + repeatedMatch[0].length,
      "의미 없는 음절 반복",
      "medium",
    );
  }

  const brokenMarker = /(?:[①-⑤㉠-㉤ㄱ-ㅎ]\s*(?:$|\n))|(?:^|\n)\s*[①-⑤㉠-㉤ㄱ-ㅎ]\s*(?=\n|$)/gu;
  let markerMatch: RegExpExecArray | null;
  while ((markerMatch = brokenMarker.exec(question)) !== null) {
    addSegment(
      segments,
      question,
      markerMatch.index,
      markerMatch.index + markerMatch[0].length,
      "보기/번호 주변 잘림",
      "low",
    );
  }

  const lineRe = /.*(?:\r\n|\n|\r|$)/g;
  let lineMatch: RegExpExecArray | null;
  while ((lineMatch = lineRe.exec(question)) !== null) {
    if (lineMatch[0] === "" && lineMatch.index === question.length) break;
    const raw = lineMatch[0];
    const line = raw.replace(/\r?\n|\r$/, "");
    if (!isMathOrEquationLine(line) && line.trim().length >= 8 && symbolRatio(line) > 0.34) {
      addSegment(
        segments,
        question,
        lineMatch.index,
        lineMatch.index + line.length,
        "기호 비율 과다",
        "medium",
      );
    }
    if (hasOddNonAsciiCharacter(line)) {
      addSegment(
        segments,
        question,
        lineMatch.index,
        lineMatch.index + line.length,
        "깨진 문자 가능성",
        "medium",
      );
    }
    if (lineRe.lastIndex === question.length) break;
  }

  const priority = { high: 0, medium: 1, low: 2 };
  return segments.sort((a, b) => priority[a.severity] - priority[b.severity] || a.start - b.start).slice(0, 20);
}
