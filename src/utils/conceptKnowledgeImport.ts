import { v4 as uuidv4 } from "uuid";
import type { EntryFormData, LearningBlock, LearningBlockType, Subject } from "../types";
import { SUBJECTS } from "../types";
import { normalizeLearningBlocks } from "./entry";

export type ConceptKnowledgeImportMode = "concepts" | "unit-lectures" | "single-lecture";

export interface ConceptKnowledgeConversion {
  entries: Partial<EntryFormData>[];
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown): string {
  return `${value ?? ""}`.trim();
}

function textList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const single = text(value);
  return single ? [single] : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function subjectFromScope(raw: unknown, fallbackSubject: Subject): Subject {
  const scope = isRecord(raw) ? raw : {};
  const candidate = text(scope.subject);
  return SUBJECTS.includes(candidate as Subject) ? (candidate as Subject) : fallbackSubject;
}

function cleanContent(lines: Array<string | undefined>): string {
  return lines.filter(Boolean).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function block(type: LearningBlockType, title: string, content: string, index: number): LearningBlock {
  return {
    id: `concept-knowledge-${index + 1}-${uuidv4().slice(0, 8)}`,
    type,
    title: title.trim() || "학습 내용",
    content: content.trim(),
  };
}

function normalizeEntryBase(partial: Partial<EntryFormData>): Partial<EntryFormData> {
  return {
    questionImages: [],
    difficult: false,
    difficulty: "none",
    myAnswer: "",
    correctAnswer: "",
    explanationParts: [],
    annotations: [],
    tags: [],
    answerKey: [],
    figures: [],
    mistakeAnalysis: { causes: [] },
    mastered: false,
    checklist: [],
    learningBlocks: [],
    concepts: [],
    ...partial,
  };
}

export function isConceptKnowledgeJson(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (text(value.sourceType) === "concept_knowledge_base") return true;
  return (
    Array.isArray(value.units) ||
    Array.isArray(value.thinkerMatrix) ||
    Array.isArray(value.examSolvingRules) ||
    isRecord(value.minimalKeywordMap)
  );
}

export function isAppCompatibleEntriesJson(value: unknown): value is { entries: unknown[] } {
  if (!isRecord(value) || "schemaVersion" in value || !Array.isArray(value.entries)) return false;
  return value.entries.length > 0 && value.entries.every((entry) => {
    if (!isRecord(entry)) return false;
    const entryKind = text(entry.entryKind);
    return entryKind === "concept" || entryKind === "lecture";
  });
}

function conceptsFromChapter(chapter: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(chapter.concepts)
    ? chapter.concepts.filter(isRecord)
    : [];
}

function chaptersFromUnit(unit: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(unit.chapters)
    ? unit.chapters.filter(isRecord)
    : [];
}

function unitsFromKnowledge(value: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(value.units) ? value.units.filter(isRecord) : [];
}

function commonTrapLines(unit: Record<string, unknown>): string[] {
  return textList(unit.commonTraps).map((trap) => `- ${trap}`);
}

function conceptBlocks(
  concept: Record<string, unknown>,
  unit: Record<string, unknown>,
  chapter: Record<string, unknown>,
): LearningBlock[] {
  const blocks: LearningBlock[] = [];
  const name = text(concept.name) || "개념";
  const definition = text(concept.definition) || text(concept.summary);
  if (definition) blocks.push(block("concept", name, definition, blocks.length));
  const examPoints = textList(concept.examPoints);
  if (examPoints.length) {
    blocks.push(block("checklist", `${name} 시험 포인트`, examPoints.map((point) => `- ${point}`).join("\n"), blocks.length));
  }
  const traps = commonTrapLines(unit);
  if (traps.length) {
    blocks.push(block("warning", `${text(unit.unitName) || text(chapter.chapterName) || name} 주의점`, traps.join("\n"), blocks.length));
  }
  return blocks;
}

function thinkerBlocks(value: Record<string, unknown>, startIndex = 0): LearningBlock[] {
  const thinkers = Array.isArray(value.thinkerMatrix) ? value.thinkerMatrix.filter(isRecord) : [];
  return thinkers.map((item, index) => {
    const name = text(item.name) || text(item.thinker) || "사상가";
    const content = cleanContent([
      textList(item.keywords).length ? `키워드\n${textList(item.keywords).map((keyword) => `- ${keyword}`).join("\n")}` : undefined,
      text(item.examJudgment) ? `판단 기준\n${text(item.examJudgment)}` : undefined,
      text(item.description),
    ]);
    return block("routine", `${name} 판단 기준`, content || name, startIndex + index);
  });
}

function examRuleBlocks(value: Record<string, unknown>, startIndex = 0): LearningBlock[] {
  return textList(value.examSolvingRules).map((rule, index) =>
    block("routine", `풀이 규칙 ${index + 1}`, rule, startIndex + index),
  );
}

function keywordMapBlocks(value: Record<string, unknown>, startIndex = 0): LearningBlock[] {
  if (!isRecord(value.minimalKeywordMap)) return [];
  return Object.entries(value.minimalKeywordMap).map(([key, raw], index) =>
    block(
      "routine",
      `${key} 키워드 맵`,
      textList(raw).length ? textList(raw).map((item) => `- ${item}`).join("\n") : text(raw),
      startIndex + index,
    ),
  );
}

function scopeBlocks(value: Record<string, unknown>, startIndex = 0): LearningBlock[] {
  const scope = isRecord(value.scope) ? value.scope : {};
  const examFocus = text(scope.examFocus);
  return examFocus ? [block("concept", "시험 범위와 초점", examFocus, startIndex)] : [];
}

function convertConcepts(value: Record<string, unknown>, fallbackSubject: Subject): Partial<EntryFormData>[] {
  const subject = subjectFromScope(value.scope, fallbackSubject);
  const entries: Partial<EntryFormData>[] = [];
  for (const unit of unitsFromKnowledge(value)) {
    const unitName = text(unit.unitName) || text(unit.name);
    for (const chapter of chaptersFromUnit(unit)) {
      const chapterName = text(chapter.chapterName) || text(chapter.name);
      for (const concept of conceptsFromChapter(chapter)) {
        const name = text(concept.name) || "개념";
        const definition = text(concept.definition) || text(concept.summary);
        const examPoints = textList(concept.examPoints);
        const memo = cleanContent([
          unitName ? `단원: ${unitName}` : undefined,
          chapterName ? `챕터: ${chapterName}` : undefined,
          examPoints.length ? `시험 포인트\n${examPoints.map((point) => `- ${point}`).join("\n")}` : undefined,
          commonTrapLines(unit).length ? `주의점\n${commonTrapLines(unit).join("\n")}` : undefined,
        ]);
        entries.push(normalizeEntryBase({
          entryKind: "concept",
          subject,
          title: name,
          question: definition || name,
          memo,
          tags: unique([subject, unitName, chapterName, name]),
          concepts: [name],
          learningBlocks: conceptBlocks(concept, unit, chapter),
        }));
      }
    }
  }
  return entries;
}

function unitLectureBlocks(unit: Record<string, unknown>, global: Record<string, unknown>): LearningBlock[] {
  const blocks: LearningBlock[] = [];
  const unitName = text(unit.unitName) || text(unit.name) || "단원";
  const examCore = text(unit.examCore);
  if (examCore) blocks.push(block("concept", `${unitName} 핵심`, examCore, blocks.length));
  for (const chapter of chaptersFromUnit(unit)) {
    const chapterName = text(chapter.chapterName) || text(chapter.name) || "챕터";
    for (const concept of conceptsFromChapter(chapter)) {
      const name = text(concept.name) || "개념";
      const definition = text(concept.definition) || text(concept.summary);
      if (definition) blocks.push(block("concept", `${chapterName} · ${name}`, definition, blocks.length));
      const examPoints = textList(concept.examPoints);
      if (examPoints.length) blocks.push(block("checklist", `${name} 시험 포인트`, examPoints.map((point) => `- ${point}`).join("\n"), blocks.length));
    }
  }
  if (commonTrapLines(unit).length) blocks.push(block("warning", `${unitName} 공통 함정`, commonTrapLines(unit).join("\n"), blocks.length));
  blocks.push(...thinkerBlocks(global, blocks.length));
  return blocks;
}

function convertUnitLectures(value: Record<string, unknown>, fallbackSubject: Subject): Partial<EntryFormData>[] {
  const subject = subjectFromScope(value.scope, fallbackSubject);
  return unitsFromKnowledge(value).map((unit) => {
    const unitName = text(unit.unitName) || text(unit.name) || "단원";
    return normalizeEntryBase({
      entryKind: "lecture",
      subject,
      title: `${unitName} 특강`,
      question: "",
      memo: "",
      tags: unique([subject, unitName, "특강자료"]),
      sourceType: "json",
      learningBlocks: unitLectureBlocks(unit, value),
    });
  });
}

function convertSingleLecture(value: Record<string, unknown>, fallbackSubject: Subject): Partial<EntryFormData>[] {
  const subject = subjectFromScope(value.scope, fallbackSubject);
  const title = text(value.title) || "개념 특강자료";
  const blocks: LearningBlock[] = [
    ...scopeBlocks(value),
    ...unitsFromKnowledge(value).flatMap((unit) => unitLectureBlocks(unit, value)),
  ];
  blocks.push(...examRuleBlocks(value, blocks.length));
  blocks.push(...keywordMapBlocks(value, blocks.length));
  return [
    normalizeEntryBase({
      entryKind: "lecture",
      subject,
      title,
      question: "",
      memo: "",
      tags: unique([subject, "특강자료", title]),
      sourceType: "json",
      learningBlocks: blocks,
    }),
  ];
}

export function detectConceptKnowledgeWarnings(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const warnings: string[] = [];
  const units = unitsFromKnowledge(value);
  const haystack = JSON.stringify({
    note: value.note,
    notes: value.notes,
    scope: value.scope,
    title: value.title,
  });
  if (units.length === 1 || /추가\s*확장|일부\s*단원|II\s*~\s*VI|Ⅱ\s*~\s*Ⅵ/i.test(haystack)) {
    warnings.push("이 파일은 전체 개념 정리처럼 보이지만 일부 단원만 포함되어 있을 수 있습니다.");
  }
  return warnings;
}

export function convertConceptKnowledge(
  value: unknown,
  mode: ConceptKnowledgeImportMode,
  fallbackSubject: Subject = "기타",
): ConceptKnowledgeConversion {
  if (!isRecord(value)) return { entries: [], warnings: ["개념 자료 JSON을 해석하지 못했습니다."] };
  const entries =
    mode === "concepts"
      ? convertConcepts(value, fallbackSubject)
      : mode === "unit-lectures"
        ? convertUnitLectures(value, fallbackSubject)
        : convertSingleLecture(value, fallbackSubject);
  return { entries, warnings: detectConceptKnowledgeWarnings(value) };
}

export function normalizeAppCompatibleEntries(
  value: unknown,
  fallbackSubject: Subject = "기타",
): Partial<EntryFormData>[] {
  if (!isAppCompatibleEntriesJson(value)) return [];
  return (value.entries as unknown[])
    .filter(isRecord)
    .map((entry) => {
      const entryKind = text(entry.entryKind);
      if (entryKind !== "concept" && entryKind !== "lecture") return null;
      const subject = SUBJECTS.includes(text(entry.subject) as Subject)
        ? (text(entry.subject) as Subject)
        : fallbackSubject;
      return normalizeEntryBase({
        entryKind,
        subject,
        title: text(entry.title) || (entryKind === "concept" ? "개념" : "특강자료"),
        question: text(entry.question),
        memo: text(entry.memo),
        tags: unique(textList(entry.tags)),
        concepts: unique(textList(entry.concepts)),
        sourceType: entryKind === "lecture" ? "json" : undefined,
        learningBlocks: normalizeLearningBlocks(entry.learningBlocks),
      });
    })
    .filter((entry): entry is Partial<EntryFormData> => Boolean(entry));
}

export function tryParseConceptKnowledgeText(input: string): unknown | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const unwrapped = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const match = unwrapped.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
