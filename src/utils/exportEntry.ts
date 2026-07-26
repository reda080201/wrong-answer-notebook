import type { SheetAnswerItem, WrongAnswerEntry } from "../types";
import { buildExamPrintModel } from "../features/export/services/buildExamPrintModel";
import { printExamDocument } from "../features/export/services/printExamDocument";
import { DEFAULT_EXAM_PRINT_PREFERENCES } from "./viewPreferences";
import { resolveExportQuestionNumbers } from "../features/export/services/resolveExportQuestionNumbers";
import { getEntryTitle } from "./entry";

function answerDifficultyLabel(item: SheetAnswerItem): string {
  if (item.difficulty === "high") return "상";
  if (item.difficulty === "medium") return "중";
  if (item.difficulty === "low") return "하";
  return "";
}

function answerSteps(item: SheetAnswerItem): string[] {
  if (item.steps?.length) return item.steps;
  return item.explanation.trim() ? [item.explanation.trim()] : [];
}

export function entryToMarkdown(entry: WrongAnswerEntry): string {
  const lines: string[] = [
    `# ${getEntryTitle(entry)}`,
    "",
    `- 과목: ${entry.subject}`,
    `- 유형: ${entry.entryKind === "problem_sheet" ? "시험지" : entry.entryKind === "concept" ? "개념" : "오답"}`,
  ];

  if (entry.tags.length) lines.push(`- 태그: ${entry.tags.map((tag) => `#${tag}`).join(" ")}`);
  if (entry.difficulty && entry.difficulty !== "none") lines.push(`- 난이도: ${entry.difficulty}`);

  lines.push("", "## 본문", "", entry.question.trim() || "(본문 없음)");

  if (entry.memo.trim()) {
    lines.push("", "## 메모", "", entry.memo.trim());
  }

  if ((entry.answerKey ?? []).length) {
    lines.push("", "## 답안지", "");
    for (const item of entry.answerKey ?? []) {
      lines.push(`### ${item.questionNumber || "?"}번`);
      lines.push(`- 정답: ${item.answer || "(비어 있음)"}`);
      const difficulty = answerDifficultyLabel(item);
      if (difficulty) lines.push(`- 난이도: ${difficulty}`);
      if (item.concepts?.length) lines.push(`- 개념: ${item.concepts.join(", ")}`);
      if (item.strategy?.trim()) lines.push(`- 풀이 전략: ${item.strategy.trim()}`);
      if (item.notes?.trim()) lines.push(`- 문제별 메모: ${item.notes.trim()}`);
      const steps = answerSteps(item);
      if (steps.length) {
        lines.push("", "풀이 과정");
        for (const [index, step] of steps.entries()) lines.push(`${index + 1}. ${step}`);
      }
      if (item.choiceJudgements?.length) {
        lines.push("", "보기별 판단");
        for (const judgement of item.choiceJudgements) {
          lines.push(`- ${[judgement.marker, judgement.text].filter(Boolean).join(": ")}`);
        }
      }
      const wrongPoints = item.wrongPoint?.trim() ? [item.wrongPoint.trim()] : item.importantPoints;
      if (wrongPoints.length) {
        lines.push("", "오답 포인트");
        for (const point of wrongPoints) lines.push(`- ${point}`);
      }
      if (item.reviewPoint?.trim()) lines.push("", `다음 복습: ${item.reviewPoint.trim()}`);
      lines.push("");
    }
  }

  if ((entry.figures ?? []).length) {
    lines.push("## 도표/그림", "");
    for (const figure of entry.figures ?? []) {
      lines.push(`### ${figure.questionNumber || "?"}번 · ${figure.title || "도표/그림"}`);
      if (figure.caption.trim()) lines.push(figure.caption.trim());
      if (figure.image) lines.push(`- 이미지: ${figure.image}`);
      if (figure.needsReview) lines.push("- 검토 필요");
      lines.push("");
    }
  }

  if (entry.questionImages.length) {
    lines.push("## 첨부 이미지", "");
    for (const image of entry.questionImages) lines.push(`- ${image}`);
  }

  return `${lines.join("\n").trim()}\n`;
}

export function downloadMarkdown(entry: WrongAnswerEntry): void {
  const blob = new Blob([entryToMarkdown(entry)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${getEntryTitle(entry).replace(/[\\/:*?"<>|]/g, "_") || "오답노트"}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function openPrintableEntry(entry: WrongAnswerEntry): Promise<void> {
  const resolved = resolveExportQuestionNumbers({
    entry,
    scope: "whole",
  });
  const model = buildExamPrintModel({
    entry,
    preferences: DEFAULT_EXAM_PRINT_PREFERENCES,
    questionNumbers: resolved.questionNumbers,
    scope: "whole",
  });
  await printExamDocument(model);
}
