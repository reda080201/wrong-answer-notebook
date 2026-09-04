export type SearchField = "subject" | "unit" | "source" | "tag";

export interface SearchTerm {
  value: string;
  field?: SearchField;
  phrase: boolean;
}

export interface SearchQuery {
  groups: SearchTerm[][];
  raw: string;
}

export interface SearchCandidate {
  id: string;
  fields: Partial<Record<SearchField | "title" | "body" | "metadata", string | string[]>>;
}

export interface SearchMatch extends SearchCandidate {
  score: number;
  matchedTerms: string[];
}

const FIELD_NAMES = new Set<SearchField>(["subject", "unit", "source", "tag"]);

function tokenize(value: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|([^\s]+)/g;
  for (const match of value.matchAll(pattern)) tokens.push(match[1] !== undefined ? match[1].replaceAll('\\"', '"') : match[2]);
  return tokens;
}

export function parseSearchQuery(raw: string): SearchQuery {
  const groups: SearchTerm[][] = [[]];
  for (const token of tokenize(raw.trim())) {
    if (token.toLocaleUpperCase("ko-KR") === "OR") {
      groups.push([]);
      continue;
    }
    const fieldMatch = token.match(/^(subject|unit|source|tag):(.*)$/i);
    const field = fieldMatch && FIELD_NAMES.has(fieldMatch[1].toLocaleLowerCase() as SearchField)
      ? fieldMatch[1].toLocaleLowerCase() as SearchField
      : undefined;
    const value = fieldMatch ? fieldMatch[2] : token;
    if (value) groups.at(-1)?.push({ value, field, phrase: token.startsWith('"') });
  }
  return { groups: groups.filter((group) => group.length > 0), raw };
}

function initials(value: string): string {
  const onset = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
  return [...value].map((char) => {
    const code = char.charCodeAt(0) - 0xac00;
    return code >= 0 && code <= 11171 ? onset[Math.floor(code / 588)] : char;
  }).join("");
}

function values(value: string | string[] | undefined): string[] { return value === undefined ? [] : Array.isArray(value) ? value : [value]; }

function matchesTerm(candidate: SearchCandidate, term: SearchTerm): { matched: boolean; score: number } {
  const fields = term.field ? [term.field] : ["title", "body", "subject", "unit", "source", "tag", "metadata"];
  const needle = term.value.toLocaleLowerCase("ko-KR");
  let best = 0;
  for (const field of fields) {
    for (const raw of values(candidate.fields[field as keyof typeof candidate.fields])) {
      const text = raw.toLocaleLowerCase("ko-KR");
      if (term.phrase ? text.includes(needle) : text.includes(needle)) {
        best = Math.max(best, field === "title" ? (text === needle ? 100 : text.startsWith(needle) ? 80 : 60) : field === "body" ? 30 : 45);
      } else if (!term.field && initials(raw).toLocaleLowerCase("ko-KR").includes(needle)) best = Math.max(best, 15);
    }
  }
  return { matched: best > 0, score: best };
}

export function rankSearchCandidates<T extends SearchCandidate>(candidates: T[], query: SearchQuery | string): Array<T & SearchMatch> {
  const parsed = typeof query === "string" ? parseSearchQuery(query) : query;
  if (parsed.groups.length === 0) return candidates.map((candidate) => ({ ...candidate, score: 0, matchedTerms: [] }));
  return candidates.flatMap((candidate) => {
    let bestScore = 0;
    let matchedTerms: string[] = [];
    for (const group of parsed.groups) {
      const matches = group.map((term) => ({ term, result: matchesTerm(candidate, term) }));
      if (matches.every(({ result }) => result.matched)) {
        const score = matches.reduce((sum, item) => sum + item.result.score, 0);
        if (score > bestScore) { bestScore = score; matchedTerms = matches.map(({ term }) => term.value); }
      }
    }
    return bestScore > 0 ? [{ ...candidate, score: bestScore, matchedTerms }] : [];
  }).sort((a, b) => b.score - a.score);
}

export function highlightTextSegments(text: string, query: string): Array<{ value: string; highlighted: boolean }> {
  const terms = parseSearchQuery(query).groups.flat().filter((term) => !term.field).map((term) => term.value).filter(Boolean);
  if (!terms.length) return [{ value: text, highlighted: false }];
  const pattern = new RegExp(`(${terms.map((term) => term.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")).join("|")})`, "giu");
  const result: Array<{ value: string; highlighted: boolean }> = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) result.push({ value: text.slice(cursor, index), highlighted: false });
    result.push({ value: match[0], highlighted: true });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) result.push({ value: text.slice(cursor), highlighted: false });
  return result.length ? result : [{ value: text, highlighted: false }];
}
