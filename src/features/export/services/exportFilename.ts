import type { ExportScopeMode } from "../../../types";

function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .replace(/[\\\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80) || "export";
}

export function buildExamPrintFilenameBase(input: {
  title: string;
  scope: ExportScopeMode;
  questionNumbers: string[];
  kind?: string;
}): string {
  const title = sanitizeFilenamePart(input.title);
  let range = "whole";
  if (input.scope === "current" && input.questionNumbers[0]) range = `${input.questionNumbers[0]}`;
  else if (input.scope === "selected") range = "selected";
  else if (input.scope === "wrong") range = "wrong";
  else if (input.scope === "important") range = "important";
  else if (input.scope === "marked") range = "review";
  else if (input.scope === "manual" && input.questionNumbers.length) {
    range = input.questionNumbers.length === 1
      ? input.questionNumbers[0]
      : `${input.questionNumbers[0]}-${input.questionNumbers[input.questionNumbers.length - 1]}`;
  }
  const kind = sanitizeFilenamePart(input.kind ?? "retake");
  return `${title}_${sanitizeFilenamePart(range)}_${kind}`;
}

export function ensurePdfExtension(filenameBase: string): string {
  return filenameBase.toLowerCase().endsWith(".pdf") ? filenameBase : `${filenameBase}.pdf`;
}
