const THINKER_ALIASES: Record<string, string> = {
  "밀": "존 스튜어트 밀",
  "존스튜어트밀": "존 스튜어트 밀",
  "j.s.밀": "존 스튜어트 밀",
  "칸트": "칸트",
  "아리스토텔레스": "아리스토텔레스",
  "공자": "공자",
};

function key(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[\s.·ㆍ_-]+/g, "");
}

export function normalizeThinkerName(value: string): string {
  const trimmed = value.normalize("NFKC").trim();
  return THINKER_ALIASES[key(trimmed)] ?? trimmed;
}

export function thinkerMatches(values: string[] | undefined, selected: string[]): boolean {
  if (!selected.length) return true;
  const normalized = new Set((values ?? []).map(normalizeThinkerName));
  return selected.some((value) => normalized.has(normalizeThinkerName(value)));
}
