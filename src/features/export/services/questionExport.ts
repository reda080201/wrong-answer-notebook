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
  sourcePageImages?: string[];
  question: string;
  contentSegments?: ExamQuestionSnapshot["contentSegments"];
  choices: string[];
  figures: Array<Pick<SheetFigureItem, "id" | "caption" | "source"> & Partial<Omit<SheetFigureItem, "id" | "caption" | "source">>>;
  answer?: string;
  explanation?: string;
}

export interface QuestionExportOptions {
  includeSourceReferences: boolean;
  includeSourcePages: boolean;
  includeAnswers?: boolean;
  includeExplanations?: boolean;
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

function safeImageName(position: number, index: number, variant: string, filename: string): string {
  const extension = filename.match(/\.(png|jpe?g|webp)$/i)?.[1]?.toLowerCase() ?? "png";
  return `q${String(position).padStart(2, "0")}_figure_${String(index).padStart(2, "0")}_${variant}.${extension}`;
}

function stripSource(item: QuestionExportItem): QuestionExportItem {
  return { ...item, source: undefined };
}

function buildMarkdown(title: string, questions: QuestionExportItem[], options: QuestionExportOptions): string {
  return [`# ${title}`, "", ...questions.flatMap((item) => [
    `## ${item.displayQuestionNumber}번`, "", item.passage ?? "", item.question,
    options.includeAnswers && item.answer ? `정답: ${item.answer}` : "",
    options.includeExplanations && item.explanation ? `해설: ${item.explanation}` : "", "",
    ...item.figures.map((figure) => figure.image ? `[그림: ${figure.image}]` : figure.caption ? `[설명 도표: ${figure.caption}]` : ""),
    ...item.choices, "",
    options.includeSourceReferences && item.source ? `<details>\n<summary>원본 출처</summary>\n\n${formatQuestionSourceLabel(item.source)}\n\n</details>` : "",
    "",
  ])].join("\n").replace(/\n{3,}/g, "\n\n");
}

function buildText(title: string, questions: QuestionExportItem[], options: QuestionExportOptions): string {
  return [`${title}`, "=".repeat(Math.min(80, Math.max(10, title.length))), "", ...questions.flatMap((item) => [
    `${item.displayQuestionNumber}번`, item.passage ?? "", item.question,
    options.includeAnswers && item.answer ? `정답: ${item.answer}` : "",
    options.includeExplanations && item.explanation ? `해설: ${item.explanation}` : "",
    ...item.figures.map((figure) => figure.image ? `[그림: ${figure.image}]` : figure.caption ? `[설명 도표: ${figure.caption}]` : ""),
    ...item.choices, options.includeSourceReferences && item.source ? `원본: ${formatQuestionSourceLabel(item.source)}` : "", "",
  ])].join("\n");
}

export function buildQuestionExportPackage(input: { title: string; subject: string; questions: QuestionExportItem[]; options?: Partial<QuestionExportOptions> }): QuestionExportPackage {
  const options: QuestionExportOptions = {
    includeSourceReferences: true,
    includeSourcePages: false,
    includeAnswers: false,
    includeExplanations: false,
    ...input.options,
  };
  const questions = input.questions.map((question) => {
    const copy = structuredClone(question) as QuestionExportItem;
    if (!options.includeSourceReferences) copy.source = undefined;
    if (!options.includeSourcePages) {
      copy.sourcePageImages = [];
      copy.figures = copy.figures.map((figure) => figure.original ? { ...figure, original: { ...figure.original, sourcePageImage: undefined } } : figure);
    }
    if (!options.includeAnswers) copy.answer = undefined;
    if (!options.includeExplanations) copy.explanation = undefined;
    return copy;
  });
  const imageNames = questions.flatMap((question) => question.figures.flatMap((figure) => {
    const names = [figure.original?.image, options.includeSourcePages ? figure.original?.sourcePageImage : undefined, figure.cleaned?.image, resolveFigureRepresentation(completeFigure(figure)).image];
    return [...new Set(names.filter((name): name is string => Boolean(name)))];
  }));
  const markdown = buildMarkdown(input.title, questions, options);
  return { manifest: { schemaVersion: "wrong-answer-notebook-question-export-v1", title: input.title, subject: input.subject, exportType: "questions_only", createdAt: new Date().toISOString(), questionCount: questions.length, questionNumbers: questions.map((question) => question.displayQuestionNumber), includesAnswers: options.includeAnswers, includesExplanations: options.includeExplanations, includesUserResponses: false, includesScratchNotes: false, includesSourceReferences: options.includeSourceReferences, includesSourcePages: options.includeSourcePages, imageDirectory: "images" }, questions, markdown, text: buildText(input.title, questions, options), imageNames };
}

export async function buildQuestionExportZip(input: { title: string; subject: string; questions: QuestionExportItem[]; options?: Partial<QuestionExportOptions> }): Promise<Blob> {
  const pack = buildQuestionExportPackage(input);
  const zip = new JSZip();
  const images = zip.folder("images");
  const sourcePagePaths = new Map<string, string>();
  const exportQuestions = structuredClone(pack.questions) as QuestionExportItem[];
  const fetchImage = async (filename: string, context: string): Promise<Blob> => {
    const response = await fetch(await getImageUrl(filename));
    if (!response.ok) throw new Error(`${context} 이미지 ${filename}을(를) 읽지 못했습니다.`);
    return response.blob();
  };
  for (const question of exportQuestions) {
    if (pack.manifest.includesSourcePages) {
      const rewrittenSourcePages: string[] = [];
      for (const [pageIndex, filename] of (question.sourcePageImages ?? []).entries()) {
        const existing = sourcePagePaths.get(filename);
        if (existing) {
          rewrittenSourcePages.push(existing);
          continue;
        }
        const extension = filename.match(/\.(png|jpe?g|webp)$/i)?.[1]?.toLowerCase() ?? "png";
        const name = `q${String(question.position).padStart(2, "0")}_source_page_${String(pageIndex + 1).padStart(2, "0")}.${extension}`;
        images?.file(name, await fetchImage(filename, "원본 페이지"));
        const exportedPath = `images/${name}`;
        sourcePagePaths.set(filename, exportedPath);
        rewrittenSourcePages.push(exportedPath);
      }
      question.sourcePageImages = rewrittenSourcePages;
    } else {
      question.sourcePageImages = [];
    }
    for (const [index, figure] of question.figures.entries()) {
      const preferred = resolveFigureRepresentation(completeFigure(figure)).image;
      const variants = [["original", figure.original?.image], ["source_page", pack.manifest.includesSourcePages ? figure.original?.sourcePageImage : undefined], ["cleaned", figure.cleaned?.image], ["preferred", preferred]] as const;
      for (const [variant, filename] of variants) {
        if (!filename) continue;
        const name = safeImageName(question.position, index + 1, variant, filename);
        images?.file(name, await fetchImage(filename, "문항"));
        const exportedPath = `images/${name}`;
        if (variant === "original" && figure.original) figure.original.image = exportedPath;
        if (variant === "source_page" && figure.original) figure.original.sourcePageImage = exportedPath;
        if (variant === "cleaned" && figure.cleaned) figure.cleaned.image = exportedPath;
        if (variant === "preferred") figure.image = exportedPath;
      }
    }
  }
  const markdown = buildMarkdown(input.title, exportQuestions, {
    ...input.options,
    includeSourceReferences: Boolean(pack.manifest.includesSourceReferences),
    includeSourcePages: Boolean(pack.manifest.includesSourcePages),
    includeAnswers: Boolean(pack.manifest.includesAnswers),
    includeExplanations: Boolean(pack.manifest.includesExplanations),
  });
  zip.file("manifest.json", JSON.stringify(pack.manifest, null, 2));
  zip.file("questions.json", JSON.stringify({ schemaVersion: "wrong-answer-notebook-question-export-v1", title: input.title, questions: exportQuestions }, null, 2));
  zip.file("questions.md", markdown);
  zip.file("README.txt", pack.manifest.includesAnswers || pack.manifest.includesExplanations ? "이 패키지는 사용자가 선택한 답안/해설을 포함합니다.\n" : "이 패키지는 정답과 해설을 포함하지 않는 문항 추출본입니다.\n");
  return zip.generateAsync({ type: "blob" });
}

export function generatedExamToQuestionExport(exam: GeneratedExam, includeSourceReferences = true): { title: string; subject: string; questions: QuestionExportItem[] } {
  return { title: exam.title, subject: exam.subject, questions: exam.questions.map((item) => ({ position: item.position, displayQuestionNumber: String(item.position), source: includeSourceReferences ? item.source : undefined, passage: item.snapshot.passage, sourcePageImages: item.snapshot.sourcePageImages, question: item.snapshot.question, contentSegments: item.snapshot.contentSegments, choices: item.snapshot.choices, figures: item.snapshot.figures, answer: item.snapshot.correctAnswer, explanation: item.snapshot.explanation })) };
}

export function entryToQuestionExport(entry: WrongAnswerEntry, questionNumbers: string[], includeSourceReferences = false): { title: string; subject: string; questions: QuestionExportItem[] } {
  const blocks = parseQuestionText(entry.question).filter((block): block is QuestionBlock => block.kind === "question");
  const answerKey = entry.answerKey ?? [];
  const requested = questionNumbers.map(normalizeQuestionNumber).filter(Boolean);
  const questions: QuestionExportItem[] = requested.map((number, index) => {
    const block = blocks.find((candidate) => normalizeQuestionNumber(candidate.numberLabel) === number || normalizeQuestionNumber(candidate.displayNumber) === number);
    if (!block) {
      if (entry.entryKind === "wrong_answer" && requested.length === 1) {
        return {
          position: index + 1,
          displayQuestionNumber: questionNumbers[index] ?? number,
          sourcePageImages: entry.questionImages,
          question: entry.question,
          choices: [],
          figures: entry.figures ?? [],
          answer: entry.correctAnswer,
          explanation: entry.explanationParts?.map((part) => part.text).filter(Boolean).join("\n"),
        };
      }
      throw new Error(`${number}번 문항을 찾지 못해 추출할 수 없습니다.`);
    }
    const contentSegments = Object.entries(entry.questionContentSegments ?? {})
      .find(([key]) => normalizeQuestionNumber(key) === number)?.[1];
    const figures = (entry.figures ?? []).filter((figure) => normalizeQuestionNumber(figure.questionNumber) === number);
    const choices = block.choices.map((choice) => `${choice.marker} ${choice.text}`.trim());
    return {
      position: index + 1,
      displayQuestionNumber: block.numberLabel || number,
      sourcePageImages: entry.questionImages,
      question: block.body,
      contentSegments,
      choices,
      figures,
      answer: answerKey.find((answer) => normalizeQuestionNumber(answer.questionNumber) === number)?.answer,
      explanation: answerKey.find((answer) => normalizeQuestionNumber(answer.questionNumber) === number)?.explanation,
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
