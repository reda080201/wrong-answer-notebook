import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { getImageUrl } from "../../../api";
import ExamPrintDocument from "../components/ExamPrintDocument";
import type { ExamPrintModel } from "../types";
import examPrintCss from "../styles/examPrint.css?raw";
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

function waitForImages(doc: Document): Promise<void> {
  const images = [...doc.images];
  if (!images.length) return Promise.resolve();
  return Promise.all(images.map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => { image.onload = () => resolve(); image.onerror = () => resolve(); }))).then(() => undefined);
}

export async function printExamDocument(model: ExamPrintModel): Promise<void> {
  const imageUrls = await collectImageUrls(model);
  // Do not pass "noopener" in features — Chromium then returns null and print always fails.
  const features = "width=960,height=720";
  const popup = window.open("", "_blank", features);
  if (popup) popup.opener = null;
  // #region agent log
  fetch('http://127.0.0.1:7928/ingest/558f3d61-3668-41a9-94c0-b971ea590ede',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'82f5f5'},body:JSON.stringify({sessionId:'82f5f5',runId:'post-fix',hypothesisId:'A',location:'printExamDocument.ts:window.open',message:'print popup open result',data:{features,popupIsNull:popup===null,popupType:popup===null?'null':typeof popup,questionCount:model.questions.length,openerCleared:popup?popup.opener===null:null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!popup) throw new Error("인쇄 창을 열 수 없습니다. 팝업 차단을 해제해 주세요.");
  const doc = popup.document;
  doc.open();
  const html = "<!doctype html>"+"<html lang=ko>"+"<head><meta charset=utf-8 /><title></title></head>"+"<body><div id=root></div></body></html>";
  doc.write(html);
  doc.close();
  doc.title = model.filenameBase;
  const style = doc.createElement("style");
  style.textContent = examPrintCss;
  doc.head.appendChild(style);
  const katexLink = doc.createElement("link");
  katexLink.rel = "stylesheet";
  katexLink.href = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";
  doc.head.appendChild(katexLink);
  const mount = doc.getElementById("root");
  if (!mount) throw new Error("인쇄 문서를 준비하지 못했습니다.");
  const root = createRoot(mount);
  root.render(createElement(ExamPrintDocument, { model, imageUrls }));
  await new Promise((resolve) => window.setTimeout(resolve, 50));
  await waitForImages(doc);
  popup.focus();
  popup.print();
}

