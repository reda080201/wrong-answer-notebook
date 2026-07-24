import JSZip from "jszip";
import type { ExamQuestionSnapshot, GeneratedExam, QuestionSourceReference, SheetFigureItem, WrongAnswerEntry } from "../../../types";
import { getImageUrl } from "../../../api";
import { formatQuestionSourceLabel } from "../../exam-builder/services/questionSource";

export interface QuestionExportItem {
  position: number;
  displayQuestionNumber: string;
  source?: QuestionSourceReference;
  passage?: string;
  question: string;
  contentSegments?: ExamQuestionSnapshot["contentSegments"];
  choices: string[];
  figures: Array<Pick<SheetFigureItem, "id" | "caption" | "source" | "placement"> & { image?: string }>;
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
  const imageNames = questions.flatMap((question) => question.figures.flatMap((figure) => figure.image ? [figure.image] : []));
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
      if (!figure.image || figure.source === "described_only") continue;
      const name = safeImageName(question.position, index + 1, figure.image);
      try {
        const response = await fetch(await getImageUrl(figure.image));
        if (response.ok) { images?.file(name, await response.blob()); figure.image = `images/${name}`; }
      } catch { /* keep the structured figure without silently inventing an image */ }
    }
  }
  zip.file("questions.json", JSON.stringify({ schemaVersion: "wrong-answer-notebook-question-export-v1", title: input.title, questions: pack.questions }, null, 2));
  return zip.generateAsync({ type: "blob" });
}

export function generatedExamToQuestionExport(exam: GeneratedExam, includeSourceReferences = true): { title: string; subject: string; questions: QuestionExportItem[] } {
  return { title: exam.title, subject: exam.subject, questions: exam.questions.map((item) => ({ position: item.position, displayQuestionNumber: String(item.position), source: includeSourceReferences ? item.source : undefined, passage: item.snapshot.passage, question: item.snapshot.question, contentSegments: item.snapshot.contentSegments, choices: item.snapshot.choices, figures: item.snapshot.figures })) };
}

export function entryToQuestionExport(entry: WrongAnswerEntry, questionNumbers: string[], includeSourceReferences = false): { title: string; subject: string; questions: QuestionExportItem[] } {
  const questions: QuestionExportItem[] = questionNumbers.map((number, index) => ({ position: index + 1, displayQuestionNumber: number, question: entry.question, contentSegments: entry.questionContentSegments?.[number], choices: [], figures: (entry.figures ?? []).filter((figure) => figure.questionNumber === number) }));
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
