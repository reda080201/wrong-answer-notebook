import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { getImageUrl } from "../../../api";
import ExamPrintDocument from "../components/ExamPrintDocument";
import type { ExamPrintModel } from "../types";
import examPrintCss from "../styles/examPrint.css?raw";
import katexCss from "katex/dist/katex.min.css?raw";
import { resolveFigureRepresentation } from "../../figures/services/figureRepresentation";

async function collectImageUrls(model: ExamPrintModel): Promise<Record<string, string>> {
  const names = new Set<string>();
  for (const question of model.questions) {
    for (const figure of question.figures ?? []) {
      const image = resolveFigureRepresentation(figure, { forPrint: true }).image;
      if (image) names.add(image);
    }
  }
  for (const filename of model.sourcePageImages) names.add(filename);
  const entries = await Promise.all(
    [...names].map(async (filename) => {
      try { return [filename, await getImageUrl(filename)] as const; }
      catch { return [filename, ""] as const; }
    }),
  );
  return Object.fromEntries(entries);
}

function waitForImages(doc: Document): Promise<string[]> {
  const images = [...doc.images];
  if (!images.length) return Promise.resolve([]);
  return Promise.all(images.map((image) => image.complete && image.naturalWidth > 0
    ? Promise.resolve<string | null>(null)
    : new Promise<string | null>((resolve) => {
      image.onload = () => resolve(null);
      image.onerror = () => resolve(image.dataset.printFilename ?? image.alt ?? "알 수 없는 이미지");
    }))).then((results) => results.filter((value): value is string => Boolean(value)));
}

export interface PrintDocumentResult {
  failedImages: string[];
  printed: boolean;
}

async function waitForStyles(doc: Document): Promise<void> {
  const stylesheets = [...doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')];
  await Promise.all(stylesheets.map((link) => link.sheet
    ? Promise.resolve()
    : new Promise<void>((resolve) => { link.onload = () => resolve(); link.onerror = () => resolve(); })));
}

export async function printExamDocument(model: ExamPrintModel): Promise<PrintDocumentResult> {
  const imageUrls = await collectImageUrls(model);
  // Do not pass "noopener" in features — Chromium then returns null and print always fails.
  const features = "width=960,height=720";
  const popup = window.open("", "_blank", features);
  if (popup) popup.opener = null;
  if (!popup) throw new Error("인쇄 창을 열 수 없습니다. 팝업 차단을 해제해 주세요.");
  const doc = popup.document;
  doc.open();
  const html = "<!doctype html>"+"<html lang=ko>"+"<head><meta charset=utf-8 /><title></title></head>"+"<body><div id=root></div></body></html>";
  doc.write(html);
  doc.close();
  doc.title = model.filenameBase;
  const style = doc.createElement("style");
  const paperSize = model.resolvedPaperSize ?? "a4";
  const orientation = model.resolvedOrientation ?? "portrait";
  style.textContent = `${examPrintCss}\n@page { size: ${paperSize.toUpperCase()} ${orientation}; }`;
  doc.head.appendChild(style);
  const katexStyle = doc.createElement("style");
  katexStyle.textContent = katexCss;
  doc.head.appendChild(katexStyle);
  const mount = doc.getElementById("root");
  if (!mount) throw new Error("인쇄 문서를 준비하지 못했습니다.");
  const root = createRoot(mount);
  root.render(createElement(ExamPrintDocument, { model, imageUrls }));
  await new Promise((resolve) => window.setTimeout(resolve, 50));
  await waitForStyles(doc);
  await doc.fonts?.ready;
  const failedImages = await waitForImages(doc);
  popup.focus();
  popup.print();
  return { failedImages, printed: true };
}

