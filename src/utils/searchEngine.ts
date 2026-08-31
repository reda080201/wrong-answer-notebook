export interface SearchTerm {
  value: string;
  phrase: boolean;
}

export interface SearchQuery {
  raw: string;
  terms: SearchTerm[];
  syntaxError?: string;
  ast?: SearchExpression[];
}

export interface SearchExpression {
  operator: "and" | "or";
  field?: "subject" | "unit" | "source" | "tag" | "important" | "review" | "difficulty";
  value: string;
  phrase: boolean;
}

export type SearchResultRank =
  | "title-exact"
  | "title-match"
  | "metadata"
  | "number"
  | "body"
  | "explanation"
  | "initials";

export interface SearchCandidate {
  title?: string;
  number?: string;
  subject?: string;
  course?: string;
  unit?: string;
  source?: string;
  tag?: string[];
  important?: boolean;
  review?: boolean;
  difficulty?: number;
  body?: string;
  explanation?: string;
  metadata?: string[];
}

export interface SearchMatch {
  matched: boolean;
  score: number;
  rank?: SearchResultRank;
}

export interface SearchSuggestion {
  value: string;
  kind: "subject" | "unit" | "source" | "tag";
}

export interface TextHighlightSegment {
  value: string;
  highlighted: boolean;
}

const INITIALS = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

function initials(value: string): string {
  return [...value].map((char) => {
    const code = char.charCodeAt(0) - 0xac00;
    if (code < 0 || code > 11171) return char.toLowerCase();
    return INITIALS[Math.floor(code / 588)];
  }).join("");
}

export function parseSearchQuery(raw: string): SearchQuery {
  const terms: SearchTerm[] = [];
  let current = "";
  let quoted = false;
  let syntaxError: string | undefined;
  const flush = () => { if (current.trim()) terms.push({ value: current.trim(), phrase: quoted }); current = ""; };
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char === '"') { if (quoted) flush(); quoted = !quoted; continue; }
    if (!quoted && /\s/.test(char)) { flush(); continue; }
    current += char;
  }
  if (quoted) syntaxError = "따옴표를 닫아 주세요.";
  flush();
  const ast: SearchExpression[] = [];
  let nextOperator: SearchExpression["operator"] = "and";
  for (const term of terms) {
    if (!term.phrase && term.value.toUpperCase() === "OR") { nextOperator = "or"; continue; }
    const match = term.value.match(/^(subject|unit|source|tag|important|review|difficulty):(.+)$/i);
    ast.push({ operator: nextOperator, field: match?.[1]?.toLowerCase() as SearchExpression["field"] | undefined, value: match?.[2] ?? term.value, phrase: term.phrase });
    nextOperator = "and";
  }
  return { raw, terms, syntaxError, ast };
}

function text(value: string | undefined): string { return value?.toLocaleLowerCase("ko-KR") ?? ""; }

export function rankSearchCandidate(candidate: SearchCandidate, query: SearchQuery | string): SearchMatch {
  const parsed = typeof query === "string" ? parseSearchQuery(query) : query;
  if (parsed.terms.length === 0) return { matched: true, score: 0 };
  const title = text(candidate.title);
  const number = text(candidate.number);
  const metadata = [candidate.subject, candidate.course, candidate.unit, ...(candidate.metadata ?? [])].map(text);
  const body = text(candidate.body);
  const explanation = text(candidate.explanation);
  let score = 0;
  let best: { score: number; rank: SearchResultRank } | undefined;
  const terms: SearchExpression[] = parsed.ast ?? parsed.terms.map((term) => ({ operator: "and" as const, value: term.value, phrase: term.phrase }));
  let groupMatched = false;
  let groupScore = 0;
  let groupRank: { score: number; rank: SearchResultRank } | undefined;
  const finishGroup = () => {
    if (!groupMatched) return false;
    score += groupScore;
    if (!best || (groupRank?.score ?? 0) > best.score) best = groupRank;
    groupMatched = false; groupScore = 0; groupRank = undefined;
    return true;
  };
  for (const term of terms) {
    const needle = text(term.value);
    const initialNeedle = initials(needle.replace(/\s/g, ""));
    const fieldValues = term.field === "subject" ? [text(candidate.subject)]
      : term.field === "unit" ? [text(candidate.unit), text(candidate.course)]
        : term.field === "source" ? [text(candidate.source)]
          : term.field === "tag" ? (candidate.tag ?? []).map(text)
            : term.field === "important" ? [candidate.important ? "true yes 중요 중요한" : "false no"]
              : term.field === "review" ? [candidate.review ? "true yes 복습 예정" : "false no"]
                : term.field === "difficulty" ? [candidate.difficulty === undefined ? "미지정" : String(candidate.difficulty)]
                  : term.phrase ? [title, ...metadata, body, explanation] : [title, number, ...metadata, body, explanation];
    const field = fieldValues;
    const found = field.some((value) => value.includes(needle));
    const initialFound = !found && initialNeedle.length > 0 && (term.field ? fieldValues : [title, ...metadata, body]).some((value) => initials(value).includes(initialNeedle));
    const matched = found || initialFound;
    if (term.operator === "and" && groupMatched) finishGroup();
    if (!matched) continue;
    let result: { score: number; rank: SearchResultRank };
    if (term.field) result = { score: 600, rank: "metadata" };
    else if (title === needle) result = { score: 1000, rank: "title-exact" };
    else if (title.includes(needle)) result = { score: title.startsWith(needle) ? 900 : 800, rank: "title-match" };
    else if (number === needle) result = { score: 700, rank: "number" };
    else if (metadata.some((value) => value.includes(needle))) result = { score: 600, rank: "metadata" };
    else if (body.includes(needle)) result = { score: 500, rank: "body" };
    else if (explanation.includes(needle)) result = { score: 400, rank: "explanation" };
    else result = { score: 100, rank: "initials" };
    groupMatched = true;
    groupScore = Math.max(groupScore, result.score);
    if (!groupRank || result.score > groupRank.score) groupRank = result;
  }
  if (!finishGroup()) return { matched: false, score: 0 };
  return { matched: true, score, rank: best?.rank };
}

export function highlightTextSegments(value: string, query: SearchQuery | string): TextHighlightSegment[] {
  const parsed = typeof query === "string" ? parseSearchQuery(query) : query;
  const needles = parsed.terms.map((term) => term.value).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!needles.length || !value) return [{ value, highlighted: false }];
  const pattern = new RegExp(`(${needles.map((needle) => needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "giu");
  return value.split(pattern).filter(Boolean).map((part) => ({ value: part, highlighted: needles.some((needle) => part.toLocaleLowerCase("ko-KR") === needle.toLocaleLowerCase("ko-KR")) }));
}

export function searchCandidateText(candidate: SearchCandidate): string {
  return [candidate.title, candidate.number, candidate.subject, candidate.course, candidate.unit, candidate.source, ...(candidate.tag ?? []), candidate.body, candidate.explanation, ...(candidate.metadata ?? [])].filter(Boolean).join(" ");
}

export function getSearchSuggestions(candidates: SearchCandidate[], prefix: string, limit = 8): SearchSuggestion[] {
  const needle = prefix.trim().toLocaleLowerCase("ko-KR");
  if (!needle) return [];
  const values: SearchSuggestion[] = [];
  for (const candidate of candidates) {
    for (const [kind, value] of [["subject", candidate.subject], ["unit", candidate.unit], ["source", candidate.source]] as const) {
      if (value && value.toLocaleLowerCase("ko-KR").includes(needle)) values.push({ value, kind });
    }
    for (const tag of candidate.tag ?? []) {
      if (tag.toLocaleLowerCase("ko-KR").includes(needle)) values.push({ value: tag, kind: "tag" });
    }
  }
  return [...new Map(values.map((item) => [`${item.kind}:${item.value}`, item])).values()].slice(0, limit);
}
