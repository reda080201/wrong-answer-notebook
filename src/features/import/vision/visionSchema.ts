import schema from "../../../../tools/diagram_pipeline/vision-v1.schema.json";
import schemaV2 from "../../../../tools/diagram_pipeline/vision-v2.schema.json";
import type { StudyAssessment } from "../../../models/studyAssessment";

export interface VisionRect { x: number; y: number; width: number; height: number; }
export interface VisionSourceRef { sourceKey: string; page: number; questionRect?: VisionRect; }
export interface VisionQuestion {
  studyAssessment?: StudyAssessment;
  questionKey: string; questionNumber: string | null; source: VisionSourceRef; sourceRefs?: VisionSourceRef[];
  questionText: string; contentSegments: Array<Record<string, unknown> & { id: string; type: string; figureKey?: string }>;
  choices: string[]; figureKeys: string[]; extractedAnswer?: string; explanationDraft?: string; uncertainties: Array<{ field: string; reason: string; severity: string }>;
}
export interface VisionFigure {
  figureKey: string; entryKey: string; questionKey: string;
  source: { sourceKey: string; page: number; rect: VisionRect };
  figureType: string; strategyHint: string; observed: Record<string, unknown>;
  proposedSpec: Record<string, unknown> | null; uncertainties: unknown[]; needsReview: boolean;
}
export interface VisionAnalysis {
  schemaVersion: "wrong-answer-notebook-vision-v1" | "wrong-answer-notebook-vision-v2";
  document: { title: string; subject: string; materialKind: string; pageCount?: number };
  sources: Array<{ sourceKey: string; pageCount?: number }>;
  entries: Array<{ entryKey: string; title: string; subject: string; questions: VisionQuestion[] }>;
  figures: VisionFigure[];
  audit: { detectedQuestionNumbers: string[]; missingQuestionNumbers: string[]; uncertainQuestionNumbers: string[]; warnings: string[] };
}
type Rule = { type?: string | string[]; const?: unknown; enum?: unknown[]; anyOf?: Rule[]; required?: string[]; properties?: Record<string, Rule>; additionalProperties?: boolean; items?: Rule; minimum?: number; maximum?: number; minLength?: number; maxLength?: number; maxItems?: number; minItems?: number };
const forbidden = new Set(["confirmed", "userApproved", "userVerified", "preferredRepresentation", "verificationSource", "verifiedBy", "sha256", "sourceImageHash", "path", "code", "python", "script", "svg", "url", "generatedBy"]);
const fail = (path: string, reason: string): never => { throw new Error(`${path}: ${reason}`); };
function check(value: unknown, rule: Rule, path = "$", depth = 0): void {
  if (depth > 40) fail(path, "nesting limit");
  if (rule.anyOf) {
    for (const option of rule.anyOf) { try { check(value, option, path, depth); return; } catch { /* Try only the declared alternatives. */ } }
    fail(path, "invalid variant");
  }
  if (("const" in rule && value !== rule.const) || (rule.enum && !rule.enum.includes(value))) fail(path, "unsupported value");
  const kind = value === null ? "null" : Array.isArray(value) ? "array" : typeof value === "number" && Number.isInteger(value) ? "integer" : typeof value;
  const types = typeof rule.type === "string" ? [rule.type] : rule.type ?? [kind];
  if (!types.includes(kind) && !(kind === "integer" && types.includes("number"))) fail(path, "invalid type");
  if (typeof value === "number" && (!Number.isFinite(value) || value < (rule.minimum ?? -Infinity) || value > (rule.maximum ?? Infinity))) fail(path, "number out of range");
  if (typeof value === "string" && ([...value].length < (rule.minLength ?? 0) || [...value].length > (rule.maxLength ?? 100000))) fail(path, "string length");
  if (Array.isArray(value)) {
    if (value.length < (rule.minItems ?? 0) || value.length > (rule.maxItems ?? 1000)) fail(path, "array limit");
    value.forEach((child, i) => check(child, rule.items ?? {}, `${path}[${i}]`, depth + 1));
  } else if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (Object.keys(object).length > 100) fail(path, "object limit");
    for (const key of rule.required ?? []) if (!Object.hasOwn(object, key)) fail(`${path}.${key}`, "required");
    for (const [key, child] of Object.entries(object)) {
      if (forbidden.has(key) || key.startsWith("__")) fail(`${path}.${key}`, "forbidden trust/execution field");
      if (rule.additionalProperties === false && !Object.hasOwn(rule.properties ?? {}, key)) fail(`${path}.${key}`, "unknown field");
      check(child, rule.properties?.[key] ?? {}, `${path}.${key}`, depth + 1);
    }
    if (Object.keys(object).sort().join(",") === "height,width,x,y") {
      const { x, y, width: w, height: h } = object as unknown as VisionRect;
      if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1 || y + h > 1) fail(path, "rectangle must fit displayed page");
    }
  }
}
/** JSON.parse alone silently overwrites duplicate object keys. Parse the bounded grammar first. */
export function strictJson(text: string): unknown {
  let i = 0;
  const space = () => { while (/[ \t\r\n]/.test(text[i] ?? "") && i < text.length) i++; };
  const string = (): string => {
    const start = i++;
    while (i < text.length) { if (text[i] === "\\") { i += 2; continue; } if (text[i++] === '"') return JSON.parse(text.slice(start, i)) as string; }
    return fail("$", "unterminated string");
  };
  const parse = (depth: number): unknown => {
    if (depth > 40) fail("$", "nesting limit");
    space();
    if (text[i] === '"') return string();
    if (text[i] === "{") {
      i++; space(); const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      if (text[i] === "}") { i++; return result; }
      while (i < text.length) {
        space(); if (text[i] !== '"') fail("$", "object key expected");
        const key = string(); if (Object.hasOwn(result, key)) fail(`$.${key}`, "duplicate JSON key");
        space(); if (text[i++] !== ":") fail("$", "colon expected");
        result[key] = parse(depth + 1); space(); const next = text[i++];
        if (next === "}") return result; if (next !== ",") fail("$", "comma expected");
      }
    } else if (text[i] === "[") {
      i++; space(); const result: unknown[] = [];
      if (text[i] === "]") { i++; return result; }
      while (i < text.length) { result.push(parse(depth + 1)); space(); const next = text[i++]; if (next === "]") return result; if (next !== ",") fail("$", "comma expected"); }
    } else {
      const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));
      if (!token) return fail("$", "invalid JSON token");
      i += token[0].length; return JSON.parse(token[0]) as unknown;
    }
    return fail("$", "incomplete JSON");
  };
  const value = parse(0); space(); if (i !== text.length) fail("$", "trailing data"); return value;
}
export function parseVisionAnalysis(text: string): VisionAnalysis {
  if (new TextEncoder().encode(text).length > 20 * 1024 * 1024) fail("$", "analysis byte limit");
  const raw = strictJson(text.replace(/^\uFEFF/, ""));
  const version = raw && typeof raw === "object" ? (raw as Record<string, unknown>).schemaVersion : undefined;
  check(raw, (version === "wrong-answer-notebook-vision-v2" ? schemaV2 : schema) as unknown as Rule);
  const value = raw as VisionAnalysis;
  const unique = (keys: string[], path: string) => { if (new Set(keys).size !== keys.length) fail(path, "duplicate identity"); };
  unique(value.sources.map(s => s.sourceKey), "$.sources"); unique(value.entries.map(e => e.entryKey), "$.entries");
  const sources = new Map(value.sources.map(s => [s.sourceKey, s]));
  const questions = new Map<string, VisionQuestion>();
  const scoped = (...parts: string[]) => JSON.stringify(parts);
  for (const entry of value.entries) {
    unique(entry.questions.map(q => q.questionKey), "$.questions");
    for (const q of entry.questions) {
      unique(q.contentSegments.map(s => s.id), "$.contentSegments");
      questions.set(scoped(entry.entryKey, q.questionKey), q);
    }
  }
  const figures = new Map<string, VisionFigure>();
  for (const figure of value.figures) {
    const key = scoped(figure.entryKey, figure.questionKey, figure.figureKey);
    if (figures.has(key) || !questions.has(scoped(figure.entryKey, figure.questionKey))) fail("$.figures", "duplicate or missing owner");
    figures.set(key, figure);
  }
  const source = (ref: VisionSourceRef) => { const bound = sources.get(ref.sourceKey); if (!bound || ref.page > (bound.pageCount ?? 10000)) fail("$.source", "unknown source or page out of range"); };
  for (const entry of value.entries) for (const q of entry.questions) {
    if (q.studyAssessment) {
      validateStudyAssessment(q.studyAssessment);
      const answerSource = q.studyAssessment.sourceAnswer;
      if (answerSource.sourceKey !== undefined) source({ sourceKey: answerSource.sourceKey, page: answerSource.page! });
    }
    const own = value.figures.filter(f => f.entryKey === entry.entryKey && f.questionKey === q.questionKey).map(f => f.figureKey).sort();
    const refs = [...q.contentSegments.filter(s => s.type === "figure").map(s => s.figureKey!), ...q.choices.flatMap(c => [...c.matchAll(/\[FIGURE:([^\]]+)\]/g)].map(m => m[1]))];
    const same = (keys: string[]) => JSON.stringify([...new Set(keys)].sort()) === JSON.stringify(own);
    if (!same(refs) || !same(q.figureKeys)) fail("$.questions", "missing, foreign or unplaced figure reference");
    [q.source, ...(q.sourceRefs ?? [])].forEach(source);
  }
  value.figures.forEach(f => source(f.source));
  return value;
}

export function validateStudyAssessment(raw: unknown): asserts raw is StudyAssessment {
  const rule = schemaV2.properties.entries.items.properties.questions.items.properties.studyAssessment;
  check(raw, rule as unknown as Rule, "$.studyAssessment");
  const a = raw as StudyAssessment;
  for (const score of Object.values(a.scores)) {
    if (!score.reasons.some(reason => reason.trim())) fail("$.studyAssessment.scores", "assessment reason required");
  }
  if (a.assessmentStatus === "unreadable" && (a.solution.proposedAnswer !== null || a.scores.difficulty.value !== null || a.scores.importance.value !== null)) fail("$.studyAssessment", "unreadable assessment cannot assert answer or scores");
  if (a.assessmentStatus !== "solved" && !a.warnings.some(reason => reason.trim())) fail("$.studyAssessment.warnings", "incomplete solution reason required");
  const answer = a.sourceAnswer;
  if (["matched", "conflict", "source_only"].includes(answer.status) && (!answer.value?.trim() || !answer.sourceKey || !Number.isInteger(answer.page))) fail("$.studyAssessment.sourceAnswer", "source answer requires value and source reference");
  if (answer.status === "not_provided" && answer.value !== null) fail("$.studyAssessment.sourceAnswer", "unprovided source answer must be null");
  if ((answer.sourceKey === undefined) !== (answer.page === undefined)) fail("$.studyAssessment.sourceAnswer", "sourceKey and page must be paired");
}

export function validateAssessmentStage(stage: string, raw: Record<string, unknown>): void {
  const all = schemaV2.properties.entries.items.properties.questions.items.properties.studyAssessment.properties;
  const names = stage === "solution_attempted" ? ["assessmentStatus", "solution", "warnings"] : stage === "scores_assessed" ? ["scores", "classification", "learning"] : ["sourceAnswer"];
  check(raw, { type: "object", required: names, additionalProperties: false, properties: Object.fromEntries(names.map(name => [name, (all as Record<string, unknown>)[name]])) as Record<string, Rule> });
  if (stage === "solution_attempted") {
    const solution = raw.solution as StudyAssessment["solution"];
    if (raw.assessmentStatus === "unreadable" && solution.proposedAnswer !== null) fail("$.solution.proposedAnswer", "unreadable solution cannot assert an answer");
    if (raw.assessmentStatus !== "solved" && !(raw.warnings as string[]).some(reason => reason.trim())) fail("$.warnings", "incomplete solution reason required");
  }
  if (stage === "scores_assessed") for (const score of Object.values(raw.scores as StudyAssessment["scores"])) {
    if (!score.reasons.some(reason => reason.trim())) fail("$.scores", "assessment reason required");
  }
}
