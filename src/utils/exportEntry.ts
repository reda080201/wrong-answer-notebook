import type { SheetAnswerItem, WrongAnswerEntry } from "../types";
import { getEntryTitle } from "./entry";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function answerDifficultyLabel(item: SheetAnswerItem): string {
  if (item.difficulty === "high") return "상";
  if (item.difficulty === "medium") return "중";
  if (item.difficulty === "low") return "하";
  return "";
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
      if (item.notes?.trim()) lines.push(`- 문제별 메모: ${item.notes.trim()}`);
      if (item.explanation.trim()) lines.push("", item.explanation.trim());
      if (item.importantPoints.length) {
        lines.push("", "중요 포인트");
        for (const point of item.importantPoints) lines.push(`- ${point}`);
      }
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

export function openPrintableEntry(entry: WrongAnswerEntry): void {
  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(getEntryTitle(entry))}</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.7; max-width: 880px; margin: 40px auto; padding: 0 24px; color: #111; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    h2 { margin-top: 32px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
    pre { white-space: pre-wrap; word-break: break-word; font: inherit; }
    .meta { color: #555; margin-bottom: 24px; }
    .answer { break-inside: avoid; border: 1px solid #ddd; padding: 14px; margin: 12px 0; border-radius: 8px; }
    @media print { body { margin: 0 auto; } button { display: none; } }
  </style>
</head>
<body>
  <button onclick="window.print()">PDF로 저장/인쇄</button>
  <h1>${escapeHtml(getEntryTitle(entry))}</h1>
  <div class="meta">${escapeHtml(entry.subject)} · ${entry.tags.map((tag) => `#${escapeHtml(tag)}`).join(" ")}</div>
  <h2>본문</h2>
  <pre>${escapeHtml(entry.question)}</pre>
  ${entry.memo.trim() ? `<h2>메모</h2><pre>${escapeHtml(entry.memo)}</pre>` : ""}
  ${(entry.answerKey ?? []).length ? `<h2>답안지</h2>${(entry.answerKey ?? []).map((item) => `
    <section class="answer">
      <strong>${escapeHtml(item.questionNumber || "?")}번 · ${escapeHtml(item.answer || "정답 없음")}</strong>
      ${item.difficulty ? `<p>난이도: ${escapeHtml(answerDifficultyLabel(item))}</p>` : ""}
      ${item.concepts?.length ? `<p>개념: ${escapeHtml(item.concepts.join(", "))}</p>` : ""}
      ${item.notes?.trim() ? `<p>문제별 메모: ${escapeHtml(item.notes)}</p>` : ""}
      ${item.explanation.trim() ? `<pre>${escapeHtml(item.explanation)}</pre>` : ""}
      ${item.importantPoints.length ? `<ul>${item.importantPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>` : ""}
    </section>`).join("")}` : ""}
  ${(entry.figures ?? []).length ? `<h2>도표/그림</h2>${(entry.figures ?? []).map((figure) => `
    <section class="answer">
      <strong>${escapeHtml(figure.questionNumber || "?")}번 · ${escapeHtml(figure.title || "도표/그림")}</strong>
      ${figure.caption.trim() ? `<pre>${escapeHtml(figure.caption)}</pre>` : ""}
      ${figure.image ? `<p>이미지: ${escapeHtml(figure.image)}</p>` : ""}
      ${figure.needsReview ? `<p>검토 필요</p>` : ""}
    </section>`).join("")}` : ""}
</body>
</html>`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
