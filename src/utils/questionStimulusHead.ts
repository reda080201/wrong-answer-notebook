export interface QuestionStimulusHead {
  /** An invalid range remains a boundary, but must never become an unbounded passage. */
  range?: { first: number; last: number };
  invalidRange?: boolean;
}

export function questionStimulusHead(line: string): QuestionStimulusHead | undefined {
  const text = line.trim();
  const range = text.match(/^\[\s*(\d{1,4})\s*(?:~|～|〜|–|—|-)\s*(\d{1,4})\s*\]/);
  if (range) {
    const first = Number(range[1]), last = Number(range[2]);
    return first > 0 && last >= first ? { range: { first, last } } : { invalidRange: true };
  }
  // Keep malformed numeric headings visible for review instead of guessing a scope.
  if (/^\[\s*\d[^\]]*(?:~|～|〜|–|—)[^\]]*\]/.test(text)) return { invalidRange: true };
  if (/^(?:\[|<)\s*(?:자료|제시문|지문|도표|그래프|그림|표)(?:\s*[A-Za-z가-힣0-9]+)?\s*(?:\]|>)$/.test(text)
    || /^표\s*(?::|：)\s*$/.test(text) || /^표\s+\d+\b/.test(text)) return {};
  return undefined;
}
