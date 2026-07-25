import JSZip from "jszip";
import type { ExamQuestionSnapshot, GeneratedExam, QuestionSourceReference, SheetFigureItem, WrongAnswerEntry } from "../../../types";
import { getImageUrl } from "../../../api";
import { formatQuestionSourceLabel } from "../../exam-builder/services/questionSource";
import { resolveFigureRepresentation } from "../../figures/services/figureRepresentation";
import { parseQuestionText, type QuestionBlock } from "../../../utils/textLayout";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";

export interface QuestionExportItem {
  position: number;
  displayQuestionNumber: string;
  source?: QuestionSourceReference;
  passage?: string;
  question: string;
  contentSegments?: ExamQuestionSnapshot["contentSegments"];
  choices: string[];
  figures: Array<Pick<SheetFigureItem, "id" | "caption" | "source"> & Partial<Omit<SheetFigureItem, "id" | "caption" | "source">>>;
}

export interface QuestionExportOptions {
  includeSourceReferences: boolean;
  includeSourcePages: boolean;
  includeAnswers?: boolean;
  includeExplanations?: boolean;
  includeUserResponses?: boolean;
  includeScratchNotes?: boolean;
}

export interface QuestionExportPackage {
  manifest: Record<string, unknown>;
  questions: QuestionExportItem[];
  markdown: string;
  text: string;
  imageNames: string[];
}

function completeFigure(figure: QuestionExportItem["figures"][number]): SheetFigureItem {
  return {
    ...figure,
    id: figure.id,
    questionNumber: figure.questionNumber ?? "",
    title: figure.title ?? "",
    caption: figure.caption,
    source: figure.source,
  };
}

function safeImageName(position: number, index: number, filename: string): string {
  const extension = filename.match(/\.(png|jpe?g|webp)$/i)?.[1]?.toLowerCase() ?? "png";
  return `q${String(position).padStart(2, "0")}_figure_${String(index).padStart(2, "0")}.${extension}`;
}

function stripSource(item: QuestionExportItem): QuestionExportItem {
  return { ...item, source: undefined };
}

function buildMarkdown(title: string, questions: QuestionExportItem[], includeSourceReferences: boolean): string {
  return [`# ${title}`, "", ...questions.flatMap((item) => [
    `## ${item.displayQuestionNumber}번`, "", item.passage ?? "", item.question, "",
    ...item.figures.map((figure) => figure.image ? `[그림: ${figure.image}]` : figure.caption ? `[설명 도표: ${figure.caption}]` : ""),
    ...item.choices, "",
    includeSourceReferences && item.source ? `<details>\n<summary>원본 출처</summary>\n\n${formatQuestionSourceLabel(item.source)}\n\n</details>` : "",
    "",
  ])].join("\n").replace(/\n{3,}/g, "\n\n");
}

function buildText(title: string, questions: QuestionExportItem[], includeSourceReferences: boolean): string {
  return [`${title}`, "=".repeat(Math.min(80, Math.max(10, title.length))), "", ...questions.flatMap((item) => [
    `${item.displayQuestionNumber}번`, item.passage ?? "", item.question,
    ...item.figures.map((figure) => figure.image ? `[그림: ${figure.image}]` : figure.caption ? `[설명 도표: ${figure.caption}]` : ""),
    ...item.choices, includeSourceReferences && item.source ? `원본: ${formatQuestionSourceLabel(item.source)}` : "", "",
  ])].join("\n");
}

export function buildQuestionExportPackage(input: { title: string; subject: string; questions: QuestionExportItem[]; options?: Partial<QuestionExportOptions> }): QuestionExportPackage {
  const options = { includeSourceReferences: true, includeSourcePages: false, ...input.options };
  const questions = options.includeSourceReferences ? input.questions : input.questions.map(stripSource);
  const imageNames = questions.flatMap((question) => question.figures.flatMap((figure) => {
    const names = [figure.original?.image, figure.cleaned?.image, resolveFigureRepresentation(completeFigure(figure)).image];
    return [...new Set(names.filter((name): name is string => Boolean(name)))];
  }));
  const markdown = buildMarkdown(input.title, questions, options.includeSourceReferences);
  return { manifest: { schemaVersion: "wrong-answer-notebook-question-export-v1", title: input.title, subject: input.subject, exportType: "questions_only", createdAt: new Date().toISOString(), questionCount: questions.length, questionNumbers: questions.map((question) => question.displayQuestionNumber), includesAnswers: false, includesExplanations: false, includesUserResponses: false, includesScratchNotes: false, includesSourceReferences: options.includeSourceReferences, imageDirectory: "images" }, questions, markdown, text: buildText(input.title, questions, options.includeSourceReferences), imageNames };
}

export async function buildQuestionExportZip(input: { title: string; subject: string; questions: QuestionExportItem[]; options?: Partial<QuestionExportOptions> }): Promise<Blob> {
  const pack = buildQuestionExportPackage(input);
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(pack.manifest, null, 2));
  zip.file("questions.json", JSON.stringify({ schemaVersion: "wrong-answer-notebook-question-export-v1", title: input.title, questions: pack.questions }, null, 2));
  zip.file("questions.md", pack.markdown);
  zip.file("README.txt", "이 패키지는 정답과 해설을 포함하지 않는 문항 추출본입니다.\n");
  const images = zip.folder("images");
  for (const question of pack.questions) {
    for (const [index, figure] of question.figures.entries()) {
      const preferred = resolveFigureRepresentation(completeFigure(figure)).image;
      const variants = [["original", figure.original?.image], ["source-page", figure.original?.sourcePageImage], ["cleaned", figure.cleaned?.image], ["preferred", preferred]] as const;
      const written = new Map<string, string>();
      for (const [variant, filename] of variants) {
        if (!filename) continue;
        let name = written.get(filename);
        if (!name) name = safeImageName(question.position, index + 1, `${variant}_${filename}`);
        try {
          if (!written.has(filename)) {
            const response = await fetch(await getImageUrl(filename));
            if (!response.ok) continue;
            images?.file(name, await response.blob());
            written.set(filename, name);
          }
          const exportedPath = `images/${name}`;
          if (variant === "original" && figure.original) figure.original.image = exportedPath;
          if (variant === "source-page" && figure.original) figure.original.sourcePageImage = exportedPath;
          if (variant === "cleaned" && figure.cleaned) figure.cleaned.image = exportedPath;
          if (variant === "preferred") figure.image = exportedPath;
        } catch { /* preserve structured metadata even when an optional asset cannot be read */ }
      }
    }
  }
  zip.file("questions.json", JSON.stringify({ schemaVersion: "wrong-answer-notebook-question-export-v1", title: input.title, questions: pack.questions }, null, 2));
  return zip.generateAsync({ type: "blob" });
}

export function generatedExamToQuestionExport(exam: GeneratedExam, includeSourceReferences = true): { title: string; subject: string; questions: QuestionExportItem[] } {
  return { title: exam.title, subject: exam.subject, questions: exam.questions.map((item) => ({ position: item.position, displayQuestionNumber: String(item.position), source: includeSourceReferences ? item.source : undefined, passage: item.snapshot.passage, question: item.snapshot.question, contentSegments: item.snapshot.contentSegments, choices: item.snapshot.choices, figures: item.snapshot.figures })) };
}

export function entryToQuestionExport(entry: WrongAnswerEntry, questionNumbers: string[], includeSourceReferences = false): { title: string; subject: string; questions: QuestionExportItem[] } {
  const blocks = parseQuestionText(entry.question).filter((block): block is QuestionBlock => block.kind === "question");
  const requested = questionNumbers.map(normalizeQuestionNumber).filter(Boolean);
  const questions: QuestionExportItem[] = requested.map((number, index) => {
    const block = blocks.find((candidate) => normalizeQuestionNumber(candidate.numberLabel) === number || normalizeQuestionNumber(candidate.displayNumber) === number);
    if (!block) {
      if (entry.entryKind === "wrong_answer" && requested.length === 1) {
        return {
          position: index + 1,
          displayQuestionNumber: questionNumbers[index] ?? number,
          question: entry.question,
          choices: [],
          figures: entry.figures ?? [],
        };
      }
      throw new Error(`${number}번 문항을 찾지 못해 추출할 수 없습니다.`);
    }
    const contentSegments = Object.entries(entry.questionContentSegments ?? {})
      .find(([key]) => normalizeQuestionNumber(key) === number)?.[1];
    const figures = (entry.figures ?? []).filter((figure) => normalizeQuestionNumber(figure.questionNumber) === number);
    return {
      position: index + 1,
      displayQuestionNumber: block.numberLabel || number,
      question: block.body,
      contentSegments,
      choices: block.choices.map((choice) => `${choice.marker} ${choice.text}`.trim()),
      figures,
    };
  });
  return { title: entry.title, subject: entry.subject, questions: includeSourceReferences ? questions : questions.map(stripSource) };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
