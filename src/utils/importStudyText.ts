import type { ChecklistItem, Difficulty, EntryFormData, ExplanationPart, SheetAnswerItem, SheetFigureItem, Subject } from "../types";
import { SUBJECTS } from "../types";
import { normalizeAnswerKey, normalizeFigures } from "./entry";
import { cleanQuestionText } from "./textCleanup";
import { parseQuestionText } from "./textLayout";

export type ImportDetectedFormat = "json" | "text";

export interface ImportedStudyText {
  detectedFormat: ImportDetectedFormat;
  data: Partial<EntryFormData>;
}

interface ImportJsonShape {
  entryKind?: unknown;
  title?: unknown;
  subject?: unknown;
  question?: unknown;
  summary?: unknown;
  tags?: unknown;
  memo?: unknown;
  checklist?: unknown;
  correctAnswer?: unknown;
  explanationParts?: unknown;
  importantNotes?: unknown;
  answerKey?: unknown;
  figures?: unknown;
  concepts?: unknown;
  difficulty?: unknown;
  difficultyByQuestion?: unknown;
}

const DEFAULT_TAGS: string[] = [];

export function isImportJson(value: unknown): value is ImportJsonShape {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function readImportFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".txt") && !name.endsWith(".md") && !name.endsWith(".json")) {
    throw new Error(".txt, .md, .json 파일만 가져올 수 있습니다.");
  }
  return file.text();
}

export function parseImportedStudyText(
  input: string,
  filename?: string,
  fallbackSubject: Subject = "수학",
): ImportedStudyText {
  const trimmed = input.trim();
  const jsonText = extractJsonObjectText(unwrapFencedJson(trimmed));
  const parsed = tryParseJson(jsonText);

  if (isImportJson(parsed)) {
    const entryKind = getString(parsed.entryKind);
    if (entryKind === "concept") {
      const title = getString(parsed.title);
      const summary = getString(parsed.summary) || getString(parsed.question);
      if (title.trim() || summary.trim()) {
        const conceptTitle = title || titleFromText(summary);
        return {
          detectedFormat: "json",
          data: {
            entryKind: "concept",
            subject: normalizeSubject(parsed.subject, fallbackSubject),
            title: conceptTitle,
            question: summary || conceptTitle,
            memo: getString(parsed.memo),
            tags: normalizeTags(parsed.tags),
            checklist: normalizeChecklist(parsed.checklist),
            questionImages: [],
            difficult: false,
            difficulty: "none",
            myAnswer: "",
            correctAnswer: "",
            explanationParts: [],
            answerKey: [],
            annotations: [],
            mastered: false,
          },
        };
      }
    }

    const question = getString(parsed.question);
    if (question.trim()) {
      const importantNotes = splitImportantNotes(parsed.importantNotes);
      const answerKey = applyQuestionMetadata(
        attachQuestionNotes(normalizeAnswerKey(parsed.answerKey), importantNotes.questionNotes),
        parsed.difficultyByQuestion,
        question,
      );
      const concepts = normalizeTextList(parsed.concepts);
      const questionWithConceptLinks = suggestConceptLinks(cleanQuestionText(question), concepts);
      return {
        detectedFormat: "json",
        data: {
          entryKind: "problem_sheet",
          subject: normalizeSubject(parsed.subject, fallbackSubject),
          title: getString(parsed.title) || titleFromFilename(filename) || titleFromText(question),
          question: questionWithConceptLinks,
          memo: mergeMemoAndImportantNotes(getString(parsed.memo), [
            ...importantNotes.globalNotes,
            ...concepts.map((concept) => `연결 개념: [[${concept}]]`),
          ]),
          correctAnswer: getString(parsed.correctAnswer),
          tags: normalizeTags(parsed.tags),
          answerKey,
          figures: normalizeImportFigures(parsed.figures),
          questionImages: [],
          difficult: false,
          difficulty: "none",
          myAnswer: "",
          explanationParts: normalizeExplanationParts(parsed.explanationParts),
          annotations: [],
          mastered: false,
        },
      };
    }
  }

  const markdown = parseMarkdownSections(trimmed);
  const question = cleanQuestionText(markdown.question || trimmed);
  return {
    detectedFormat: "text",
    data: {
      entryKind: "problem_sheet",
      subject: fallbackSubject,
      title: titleFromFilename(filename) || titleFromText(question),
      question,
      tags: DEFAULT_TAGS,
      questionImages: [],
      difficult: false,
      difficulty: "none",
      myAnswer: "",
      correctAnswer: "",
      explanationParts: [],
      memo: mergeMemoAndImportantNotes(markdown.memo, markdown.importantNotes),
      answerKey: markdown.answerKey,
      figures: [],
      annotations: [],
      mastered: false,
    },
  };
}

export function isSafeImportImageFilename(value: string): boolean {
  const trimmed = value.trim();
  return (
    Boolean(trimmed) &&
    !trimmed.includes("/") &&
    !trimmed.includes("\\") &&
    !trimmed.includes("..") &&
    !trimmed.startsWith(".") &&
    /\.(png|jpe?g|webp)$/i.test(trimmed)
  );
}

function tryParseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function unwrapFencedJson(input: string): string {
  const match = input.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : input;
}

function extractJsonObjectText(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return trimmed;
  return trimmed.slice(start, end + 1).trim();
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSubject(value: unknown, fallback: Subject): Subject {
  return typeof value === "string" && SUBJECTS.includes(value as Subject)
    ? (value as Subject)
    : fallback;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_TAGS;
  const tags = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return tags.length ? [...new Set(tags)] : DEFAULT_TAGS;
}

function normalizeTextList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((item) => item.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeExplanationParts(value: unknown): ExplanationPart[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Partial<ExplanationPart> => Boolean(item && typeof item === "object"))
    .map((item, index) => ({
      id: typeof item.id === "string" && item.id.trim() ? item.id : `gpt-solution-${index + 1}`,
      text: typeof item.text === "string" ? item.text.trim() : "",
      images: Array.isArray(item.images)
        ? item.images.filter((image): image is string => typeof image === "string")
        : [],
    }))
    .filter((item) => item.text || item.images.length);
}

function normalizeImportFigures(value: unknown): SheetFigureItem[] {
  return normalizeFigures(value).map((figure) => {
    const image = figure.image && isSafeImportImageFilename(figure.image) ? figure.image : undefined;
    return {
      ...figure,
      image,
      needsReview: figure.needsReview || Boolean(figure.image && !image),
    };
  });
}

function normalizeChecklist(value: unknown): ChecklistItem[] {
  const source = Array.isArray(value) ? value : normalizeTextList(value);
  return source
    .map((item, index): ChecklistItem | null => {
      if (typeof item === "string") {
        const text = item.trim();
        return text ? { id: `import-check-${index + 1}`, text, checked: false } : null;
      }
      if (item && typeof item === "object") {
        const typed = item as { id?: unknown; text?: unknown; checked?: unknown };
        const text = getString(typed.text);
        return text
          ? {
              id: getString(typed.id) || `import-check-${index + 1}`,
              text,
              checked: typed.checked === true,
            }
          : null;
      }
      return null;
    })
    .filter((item): item is ChecklistItem => Boolean(item));
}

function normalizeDifficulty(value: unknown): Difficulty | undefined {
  if (value === "high" || value === "상" || value === "어려움") return "high";
  if (value === "medium" || value === "중" || value === "보통") return "medium";
  if (value === "low" || value === "하" || value === "쉬움") return "low";
  if (value === "none" || value === "없음") return "none";
  return undefined;
}

interface QuestionMetadata {
  difficulty?: Difficulty;
  concepts?: string[];
  notes?: string;
  importantPoints?: string[];
}

function normalizeNumber(value: string): string {
  return value.trim().replace(/^#/, "").replace(/^(문제|문항)\s*/, "").replace(/[.)번]\s*$/, "").replace(/^0+/, "") || value.trim();
}

function questionAliasMap(question: string): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const block of parseQuestionText(question)) {
    if (block.kind !== "question") continue;
    const display = String(block.displayNumber);
    const original = normalizeNumber(block.numberLabel);
    aliases.set(normalizeNumber(display), original || display);
    if (original) aliases.set(original, display);
  }
  return aliases;
}

function metadataFromObject(value: Record<string, unknown>): QuestionMetadata {
  return {
    difficulty: normalizeDifficulty(value.difficulty),
    concepts: normalizeTextList(value.concepts),
    notes: getString(value.notes) || getString(value.memo) || getString(value.note),
    importantPoints: normalizeTextList(value.importantPoints),
  };
}

function applyQuestionMetadata(answerKey: SheetAnswerItem[], raw: unknown, question = ""): SheetAnswerItem[] {
  if (!raw || typeof raw !== "object") return answerKey;

  const byNumber = new Map<string, QuestionMetadata>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const value = item as { questionNumber?: unknown; number?: unknown; difficulty?: unknown; concepts?: unknown };
      const questionNumber = `${value.questionNumber ?? value.number ?? ""}`.trim();
      if (!questionNumber) continue;
      byNumber.set(normalizeNumber(questionNumber), metadataFromObject(value as Record<string, unknown>));
    }
  } else {
    for (const [questionNumber, value] of Object.entries(raw)) {
      if (typeof value === "string") {
        byNumber.set(normalizeNumber(questionNumber), { difficulty: normalizeDifficulty(value) });
      } else if (value && typeof value === "object") {
        byNumber.set(normalizeNumber(questionNumber), metadataFromObject(value as Record<string, unknown>));
      }
    }
  }

  const aliases = questionAliasMap(question);
  return answerKey.map((item) => {
    const normalized = normalizeNumber(item.questionNumber);
    const alias = aliases.get(normalized);
    const meta = byNumber.get(normalized) ?? (alias ? byNumber.get(normalizeNumber(alias)) : undefined);
    return {
      ...item,
      difficulty:
        meta?.difficulty && meta.difficulty !== "none"
          ? meta.difficulty
          : item.difficulty,
      concepts: meta?.concepts?.length ? meta.concepts : item.concepts,
      notes: item.notes?.trim() ? item.notes : meta?.notes?.trim() || item.notes,
      importantPoints: meta?.importantPoints?.length ? meta.importantPoints : item.importantPoints,
    };
  });
}

function splitImportantNotes(raw: unknown): {
  globalNotes: string[];
  questionNotes: Array<{ questionNumber: string; text: string }>;
} {
  const globalNotes: string[] = [];
  const questionNotes: Array<{ questionNumber: string; text: string }> = [];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];

  for (const value of values) {
    if (typeof value === "string") {
      const match = value.match(/(?:문제|문항)?\s*#?(\d{1,3})\s*(?:번|[.)])?\s*[:：-]?\s*(.+)/);
      if (match && /(문제|문항|번)/.test(value)) {
        questionNotes.push({ questionNumber: match[1], text: match[2].trim() || value.trim() });
      } else if (value.trim()) {
        globalNotes.push(value.trim());
      }
      continue;
    }
    if (!value || typeof value !== "object") continue;
    const typed = value as Record<string, unknown>;
    const questionNumber = `${typed.questionNumber ?? typed.number ?? typed.no ?? ""}`.trim();
    const text = getString(typed.notes) || getString(typed.note) || getString(typed.memo) || getString(typed.text);
    if (questionNumber && text.trim()) questionNotes.push({ questionNumber, text });
    else if (text.trim()) globalNotes.push(text);
  }

  return { globalNotes, questionNotes };
}

function attachQuestionNotes(
  answerKey: SheetAnswerItem[],
  notes: Array<{ questionNumber: string; text: string }>,
): SheetAnswerItem[] {
  if (!notes.length) return answerKey;
  const next = answerKey.map((item) => ({ ...item }));
  for (const note of notes) {
    const normalized = normalizeNumber(note.questionNumber);
    const index = next.findIndex((item) => normalizeNumber(item.questionNumber) === normalized);
    if (index >= 0) {
      const current = next[index];
      next[index] = {
        ...current,
        notes: [current.notes?.trim(), note.text.trim()].filter(Boolean).join("\n"),
      };
      continue;
    }
    next.push({
      id: "",
      questionNumber: note.questionNumber.trim(),
      answer: "",
      explanation: "",
      notes: note.text.trim(),
      importantPoints: [],
      concepts: [],
    });
  }
  return normalizeAnswerKey(next);
}

function suggestConceptLinks(text: string, concepts: string[]): string {
  let next = text;
  for (const concept of concepts) {
    const trimmed = concept.trim();
    if (!trimmed || next.includes(`[[${trimmed}]]`)) continue;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?<!\\[\\[)${escaped}(?!\\]\\])`, "g");
    next = next.replace(pattern, `[[${trimmed}]]`);
  }
  return next;
}

function mergeMemoAndImportantNotes(memo: string, notes: string[]): string {
  const parts: string[] = [];
  if (memo.trim()) parts.push(memo.trim());
  if (notes.length) {
    parts.push(["중요 포인트", ...notes.map((note) => `- ${note}`)].join("\n"));
  }
  return parts.join("\n\n");
}

function parseMarkdownSections(input: string) {
  const sections = new Map<string, string[]>();
  let current = "question";

  for (const line of input.split(/\r?\n/)) {
    const heading = line.match(/^\s{0,3}#{1,4}\s*(문제|문항|본문|시험지|중요\s*포인트|중요|메모|답안지|답안|정답|해설)\s*$/i);
    if (heading) {
      current = normalizeHeading(heading[1]);
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (!sections.has(current)) sections.set(current, []);
    sections.get(current)?.push(line);
  }

  const question = sectionText(sections, "question");
  const memo = sectionText(sections, "memo");
  const importantNotes = normalizeTextList(sectionText(sections, "importantNotes"));
  const answerKey = parseMarkdownAnswerKey(sectionText(sections, "answerKey"));
  return { question, memo, importantNotes, answerKey };
}

function normalizeHeading(heading: string): string {
  const compact = heading.replace(/\s+/g, "");
  if (compact.includes("중요")) return "importantNotes";
  if (compact.includes("메모")) return "memo";
  if (compact.includes("답안") || compact.includes("정답") || compact.includes("해설")) return "answerKey";
  return "question";
}

function sectionText(sections: Map<string, string[]>, key: string): string {
  return (sections.get(key) ?? []).join("\n").trim();
}

function parseMarkdownAnswerKey(text: string) {
  const items = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s*/, ""))
    .map((line) => {
      const tableParts = line
        .split("|")
        .map((part) => part.trim())
        .filter(Boolean);
      if (tableParts.length >= 2 && !/^[-:]+$/.test(tableParts.join(""))) {
        return {
          questionNumber: tableParts[0].replace(/^(문제\s*)?/, "").replace(/[.)번]\s*$/, ""),
          answer: tableParts[1],
          explanation: tableParts[2] ?? "",
          importantPoints: tableParts[3] ? [tableParts[3]] : [],
          notes: tableParts[4] ?? "",
        };
      }

      const match = line.match(/^(?:문제\s*)?(\d{1,3}|#\d{1,3})[.)번\s]*[:-]?\s*(.+)$/);
      if (!match) {
        return {
          questionNumber: "",
          answer: "",
          explanation: line,
          importantPoints: [],
        };
      }
      const rest = match[2].trim();
      const [answer, ...explanationParts] = rest.split(/\s+[-–—:]\s+/);
      return {
        questionNumber: match[1].replace(/^#/, ""),
        answer: answer.trim(),
        explanation: explanationParts.join(" - ").trim(),
        importantPoints: [],
      };
    });

  return normalizeAnswerKey(items);
}

function titleFromFilename(filename?: string): string {
  if (!filename) return "";
  return filename.replace(/\.[^.]+$/, "").trim().slice(0, 80);
}

function titleFromText(text: string): string {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ? firstLine.slice(0, 80) : "GPT 변환 시험지";
}
