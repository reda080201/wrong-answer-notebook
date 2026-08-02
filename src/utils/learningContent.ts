import type { LearningBlock, LearningBlockType } from "../models/learning";
import type { LectureSourceType, SheetAnswerItem, WrongAnswerEntry } from "../models/entry";
import { normalizeDiagramSpec, normalizeLearningDiagramType } from "./entry";
import {
  isLearningImportance,
  isLearningReviewStatus,
  isLearningSubjectDomain,
  normalizeChoiceExamples,
  normalizeLearningSourceReferences,
  normalizePassageExamples,
  normalizeSubjectLearningMetadata,
} from "../features/learning/model/learningMetadata";

const SAFE_BLOCK_TYPES = new Set<LearningBlockType>([
  "concept",
  "formula",
  "routine",
  "warning",
  "review",
  "checklist",
  "diagram",
]);

function blockId(prefix: string, index: number) {
  return `${prefix}-${index + 1}`;
}

function cleanText(value: string): string {
  return value.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function makeBlock(type: LearningBlockType, title: string, content: string, index: number): LearningBlock {
  return {
    id: blockId("learning", index),
    type,
    title: title.trim() || "학습 내용",
    content: cleanText(content),
  };
}

function answerLabel(item: SheetAnswerItem) {
  return item.questionNumber.trim() ? `${item.questionNumber.trim()}번` : "공통";
}

export function buildLearningBlocksFromEntry(entry: WrongAnswerEntry): LearningBlock[] {
  const blocks: LearningBlock[] = [];
  const answers = entry.answerKey ?? [];
  const concepts = [...new Set(answers.flatMap((item) => item.concepts ?? []).map((item) => item.trim()).filter(Boolean))];

  if (concepts.length) {
    blocks.push(makeBlock("concept", "핵심 개념", concepts.map((concept) => `- [[${concept}]]`).join("\n"), blocks.length));
  }

  for (const item of answers) {
    const label = answerLabel(item);
    if (item.strategy?.trim()) {
      blocks.push(makeBlock("formula", `${label} 풀이 전략`, item.strategy, blocks.length));
    }
    if (item.steps?.length) {
      blocks.push(makeBlock("routine", `${label} 풀이 루틴`, item.steps.map((step, index) => `${index + 1}. ${step}`).join("\n"), blocks.length));
    }
    if (item.wrongPoint?.trim() || item.importantPoints.length) {
      blocks.push(makeBlock("warning", `${label} 오답 포인트`, item.wrongPoint?.trim() || item.importantPoints.map((point) => `- ${point}`).join("\n"), blocks.length));
    }
    if (item.reviewPoint?.trim()) {
      blocks.push(makeBlock("review", `${label} 다음 복습`, item.reviewPoint, blocks.length));
    }
    if (item.diagramSpec) {
      blocks.push({
        ...makeBlock("diagram", `${label} 시각화`, item.strategy || item.concepts?.join(", ") || "시각화가 필요한 개념입니다.", blocks.length),
        sourceQuestionNumber: item.questionNumber,
        diagramSpec: item.diagramSpec,
      });
    }
  }

  if (!blocks.length && entry.memo.trim()) {
    blocks.push(makeBlock("checklist", "전체 메모", entry.memo, blocks.length));
  }

  return blocks;
}

export function normalizeImportedLearningBlocks(raw: unknown): LearningBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index): LearningBlock | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const type = typeof record.type === "string" && SAFE_BLOCK_TYPES.has(record.type as LearningBlockType)
        ? record.type as LearningBlockType
        : "concept";
      const title = typeof record.title === "string" ? record.title : "학습 내용";
      const itemList = Array.isArray(record.items)
        ? record.items.map((item) => `${item ?? ""}`.trim()).filter(Boolean).map((item) => `- ${item}`).join("\n")
        : "";
      const content = [
        record.content,
        record.body,
        record.formula,
        itemList,
        record.description,
      ]
        .map((value) => `${value ?? ""}`.trim())
        .find(Boolean) ?? "";
      if (!title.trim() && !content.trim()) return null;
      return {
        id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : blockId("imported-learning", index),
        type,
        title: title.trim() || "학습 내용",
        content: cleanText(content),
        sourceQuestionNumber: typeof record.sourceQuestionNumber === "string" ? record.sourceQuestionNumber.trim() : undefined,
        diagramType: normalizeLearningDiagramType(record.diagramType),
        diagramSpec: normalizeDiagramSpec(record.diagramSpec),
        subjectDomain: isLearningSubjectDomain(record.subjectDomain) ? record.subjectDomain : undefined,
        unit: typeof record.unit === "string" ? record.unit.trim() || undefined : undefined,
        subunit: typeof record.subunit === "string" ? record.subunit.trim() || undefined : undefined,
        keywords: Array.isArray(record.keywords) ? record.keywords.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()) : undefined,
        importance: isLearningImportance(record.importance) ? record.importance : undefined,
        reviewStatus: isLearningReviewStatus(record.reviewStatus) ? record.reviewStatus : undefined,
        passageExamples: normalizePassageExamples(record.passageExamples),
        choiceExamples: normalizeChoiceExamples(record.choiceExamples),
        commonTraps: Array.isArray(record.commonTraps) ? record.commonTraps.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()) : undefined,
        relatedConcepts: Array.isArray(record.relatedConcepts) ? record.relatedConcepts.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()) : undefined,
        sourceReferences: normalizeLearningSourceReferences(record.sourceReferences),
        subjectMetadata: normalizeSubjectLearningMetadata(record.subjectMetadata),
      };
    })
    .filter(Boolean) as LearningBlock[];
}

export function parseMarkdownOrTextToLearningBlocks(input: string): LearningBlock[] {
  const text = cleanText(input);
  if (!text) return [];
  const blocks: LearningBlock[] = [];
  const sections = text.split(/(?=^#{1,3}\s+.+$)/m).map((part) => part.trim()).filter(Boolean);
  const source = sections.length ? sections : [text];

  for (const section of source) {
    const lines = section.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const heading = lines[0]?.replace(/^#{1,3}\s+/, "") ?? "학습 내용";
    const content = lines[0]?.startsWith("#") ? lines.slice(1).join("\n") : lines.join("\n");
    const normalizedHeading = heading.toLowerCase();
    const type: LearningBlockType =
      /개념|concept/.test(normalizedHeading) ? "concept" :
      /공식|formula|전략/.test(normalizedHeading) ? "formula" :
      /루틴|단계|풀이|routine|step/.test(normalizedHeading) ? "routine" :
      /주의|오답|실수|warning/.test(normalizedHeading) ? "warning" :
      /복습|review/.test(normalizedHeading) ? "review" :
      "checklist";
    blocks.push(makeBlock(type, heading, content || heading, blocks.length));
  }

  return blocks;
}

function collectTextFromElement(element: Element): string {
  const rows: string[] = [];
  const tag = element.tagName.toLowerCase();
  if (tag === "table") {
    for (const row of Array.from(element.querySelectorAll("tr"))) {
      const cells = Array.from(row.querySelectorAll("th,td")).map((cell) => cell.textContent?.trim()).filter(Boolean);
      if (cells.length) rows.push(cells.join(" | "));
    }
    return rows.join("\n");
  }
  if (tag === "ul" || tag === "ol") {
    for (const item of Array.from(element.querySelectorAll(":scope > li"))) {
      const text = item.textContent?.trim();
      if (text) rows.push(`- ${text}`);
    }
    return rows.join("\n");
  }
  return element.textContent?.trim() ?? "";
}

export function sanitizeHtmlToLearningBlocks(html: string): LearningBlock[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("script,style,iframe,svg,object,embed,img,link,meta").forEach((node) => node.remove());
  const elements = Array.from(document.body.querySelectorAll("h1,h2,h3,p,ul,ol,table,code,pre"));
  const blocks: LearningBlock[] = [];
  let currentTitle = "HTML 특강";
  let currentContent: string[] = [];

  const flush = () => {
    const content = cleanText(currentContent.join("\n"));
    if (content) blocks.push(makeBlock("checklist", currentTitle, content, blocks.length));
    currentContent = [];
  };

  for (const element of elements) {
    const tag = element.tagName.toLowerCase();
    const text = collectTextFromElement(element);
    if (!text) continue;
    if (tag === "h1" || tag === "h2" || tag === "h3") {
      flush();
      currentTitle = text;
    } else {
      currentContent.push(text);
    }
  }
  flush();
  return blocks;
}

export function parseLearningImportText(input: string, filename?: string): LearningBlock[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  if (filename?.toLowerCase().endsWith(".html") || /<\/?[a-z][\s\S]*>/i.test(trimmed)) {
    return sanitizeHtmlToLearningBlocks(trimmed);
  }
  if (filename?.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return normalizeImportedLearningBlocks(parsed);
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { learningBlocks?: unknown }).learningBlocks)) {
      return normalizeImportedLearningBlocks((parsed as { learningBlocks: unknown }).learningBlocks);
    }
    return [];
  }
  return parseMarkdownOrTextToLearningBlocks(trimmed);
}

export interface LectureImportResult {
  blocks: LearningBlock[];
  title: string;
  sourceType: LectureSourceType;
}

function sourceTypeFromFilename(filename?: string): LectureSourceType {
  const lower = filename?.toLowerCase() ?? "";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".md")) return "md";
  if (lower.endsWith(".json")) return "json";
  return "txt";
}

export function parseLectureImportText(input: string, filename?: string): LectureImportResult {
  const blocks = parseLearningImportText(input, filename);
  const titleFromBlock = blocks.find((block) => block.title.trim())?.title.trim();
  const titleFromFile = filename?.replace(/\.[^.]+$/, "").trim();
  return {
    blocks,
    title: titleFromBlock || titleFromFile || "가져온 특강자료",
    sourceType: sourceTypeFromFilename(filename),
  };
}

export async function readLearningImportFile(file: File): Promise<LearningBlock[]> {
  const name = file.name.toLowerCase();
  if (!/\.(html|txt|md|json)$/.test(name)) {
    throw new Error(".html, .txt, .md, .json 파일만 가져올 수 있습니다.");
  }
  const { decodeTextFile } = await import("../features/import/services/decodeTextFile");
  return parseLearningImportText((await decodeTextFile(file)).text, file.name);
}

export async function readLectureImportFile(file: File): Promise<LectureImportResult> {
  const name = file.name.toLowerCase();
  if (!/\.(html|txt|md|json)$/.test(name)) {
    throw new Error(".html, .txt, .md, .json 파일만 가져올 수 있습니다.");
  }
  const { decodeTextFile } = await import("../features/import/services/decodeTextFile");
  return parseLectureImportText((await decodeTextFile(file)).text, file.name);
}
