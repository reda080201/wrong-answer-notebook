import katex from "katex";
import { typesetMathExpression } from "../../../utils/mathTypesetting";
import katexCss from "katex/dist/katex.min.css?inline";
import type { QuestionContentSegment, SheetFigureItem } from "../../../types";
import { tokenizeMathForDisplay } from "../../../components/MathText";
import { resolveFigureRepresentation } from "../../figures/services/figureRepresentation";
import { parseChoice } from "../../../utils/choice";
import { buildQuestionExportComposition } from "./questionPngModel";
import type { QuestionPngCompositionContent, QuestionPngOptions } from "./questionPngModel";

export * from "./questionPngModel";

function createElement(tag: string, className?: string) { const element = document.createElement(tag); if (className) element.className = className; return element; }

function appendMathText(target: HTMLElement, value: string) {
  for (const segment of tokenizeMathForDisplay(value)) {
    if (segment.type === "text") { target.append(document.createTextNode(segment.value)); continue; }
    if (segment.type === "invalid-math") { const invalid = createElement("span", "question-export-surface__invalid-math"); invalid.textContent = "수식 형식 확인 필요"; target.append(invalid); continue; }
    const math = createElement("span", segment.displayMode ? "question-export-surface__math question-export-surface__math--display" : "question-export-surface__math");
    try { math.innerHTML = katex.renderToString(typesetMathExpression(segment.expression, segment.displayMode), { displayMode: segment.displayMode, throwOnError: true, trust: false, strict: "warn", output: "html" }); }
    catch { math.textContent = "수식 형식 확인 필요"; math.className = "question-export-surface__invalid-math"; }
    target.append(math);
  }
}
function appendSegment(surface: HTMLElement, segment: QuestionContentSegment, figures: Map<string, SheetFigureItem>, images: Map<string, string>) {
  const block = createElement("section", `question-export-surface__segment question-export-surface__segment--${segment.type}`);
  if (segment.type === "text") appendMathText(block, segment.text);
  else if (segment.type === "condition") { const label = createElement("strong"); label.textContent = segment.label ?? "조건"; block.append(label); appendMathText(block, segment.text); }
  else if (segment.type === "equation") appendMathText(block, segment.display ? `$$${segment.latex}$$` : `\\(${segment.latex}\\)`);
  else if (segment.type === "table") { const table = document.createElement("table"); const body = document.createElement("tbody"); for (const row of segment.rows) { const tr = document.createElement("tr"); for (const cell of row) { const td = document.createElement("td"); appendMathText(td, cell); tr.append(td); } body.append(tr); } table.append(body); block.append(table); }
  else { const figure = figures.get(segment.figureId); const representation = figure && resolveFigureRepresentation(figure, { forPrint: true }); const url = representation?.image ? images.get(representation.image) : undefined; if (url) { const image = new Image(); image.src = url; image.alt = figure?.title || "문항 그림"; image.className = "question-export-surface__figure"; image.style.cssText = "display:block;max-width:100%;max-height:640px;object-fit:contain;margin:16px auto;"; block.append(image); } else { block.textContent = "그림을 준비하지 못했습니다."; } }
  surface.append(block);
}

async function waitForImages(surface: HTMLElement) {
  await Promise.all([...surface.querySelectorAll("img")].map(async (image) => {
    if (!image.complete) await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("문항 그림을 불러오지 못했습니다.")); });
    if (typeof image.decode === "function") await image.decode();
  }));
  // The SVG export embeds the KaTeX font assets itself. Waiting for every font
  // requested by the live application can stall a deterministic export forever.
}

async function buildExportStyle(): Promise<string> {
  // Keep export styling independent from the live theme and DOM. KaTeX's HTML
  // output is intentionally paired with the small subset of layout rules it
  // needs for SVG foreignObject rasterization.
  const urls = [...katexCss.matchAll(/url\(([^)]+)\)/g)].map((match) => match[1].replace(/["']/g, "").trim());
  const replacements = await Promise.all(urls.map(async (url) => {
    const response = await fetch(new URL(url, window.location.href));
    if (!response.ok) throw new Error("KaTeX 글꼴을 준비하지 못했습니다.");
    const blob = await response.blob();
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("KaTeX 글꼴을 읽지 못했습니다.")); reader.readAsDataURL(blob); });
    return [url, data] as const;
  }));
  return `.question-export-surface{box-sizing:border-box;white-space:normal}.question-export-surface__choice{display:flex;gap:12px;align-items:flex-start}.question-export-surface__choice-marker{flex:0 0 auto;font-weight:600}.question-export-surface__choice-content{min-width:0}.question-export-surface__invalid-math{color:#9f1239;font-weight:600}.question-export-surface__math{display:inline-block}.question-export-surface__math--display{display:block;margin:12px 0;text-align:center}` + replacements.reduce((css, [url, data]) => css.replaceAll(url, data), katexCss);
}

/** Builds a deterministic canonical export surface, independent from live study UI. */
export async function renderCanonicalQuestionToPng(content: QuestionPngCompositionContent, options: QuestionPngOptions): Promise<Blob> {
  const figures = new Map(content.figures.map((figure) => [figure.id, figure]));
  const selectedImages = content.figures.map((figure) => resolveFigureRepresentation(figure, { forPrint: true }).image).filter((image): image is string => Boolean(image));
  const resolved = await Promise.all(selectedImages.map(async (image) => [image, await content.resolveImageUrl(image)] as const));
  if (resolved.some(([, url]) => !url)) throw new Error("문항 그림을 준비하지 못했습니다.");
  const images = new Map(resolved.filter((item): item is [string, string] => Boolean(item[1])));
  const surface = createElement("article", "question-export-surface");
  surface.style.cssText = `position:fixed;display:block;left:-100000px;top:0;width:900px;padding:48px;box-sizing:border-box;background:${options.background === "white" ? "#fff" : "transparent"};color:#111827;font:400 18px/1.65 Pretendard,Arial,sans-serif;`;
  const heading = createElement("header", "question-export-surface__header"); heading.textContent = `${content.question.questionNumber}번`; surface.append(heading);
  const composition = buildQuestionExportComposition(content.question);
  const segments = composition.segments;
  segments.forEach((segment) => appendSegment(surface, segment, figures, images));
  if (content.question.choices.length) {
    const choices = createElement("div", "question-export-surface__choices");
    content.question.choices.forEach((choice) => { const item = createElement("div", "question-export-surface__choice"); const parsed = parseChoice(choice); const marker = createElement("span", "question-export-surface__choice-marker"); marker.textContent = parsed.marker; const body = createElement("span", "question-export-surface__choice-content"); appendMathText(body, parsed.content); item.append(marker, body); choices.append(item); });
    surface.append(choices);
  }
  const appendExtra = (label: string, value?: string) => { if (!value?.trim()) return; const extra = createElement("section", "question-export-surface__extra"); const title = createElement("strong"); title.textContent = label; extra.append(title); const body = document.createElement("div"); appendMathText(body, value); extra.append(body); surface.append(extra); };
  if (options.scope !== "question") appendExtra("정답", content.answer);
  if (options.scope === "question_answer_explanation") appendExtra("해설", content.explanation);
  document.body.append(surface);
  try {
    await waitForImages(surface);
    const bounds = surface.getBoundingClientRect();
    const width = Math.ceil(Math.max(bounds.width, surface.offsetWidth, surface.scrollWidth, 900));
    const height = Math.ceil(Math.max(bounds.height, surface.offsetHeight, surface.scrollHeight, 1));
    const serialized = surface.cloneNode(true) as HTMLElement;
    // The live measurement surface lives offscreen; its serialized export must
    // start at the foreignObject origin or every glyph is rasterized outside the canvas.
    serialized.style.position = "static";
    serialized.style.left = "0";
    serialized.style.top = "0";
    const style = document.createElement("style"); style.textContent = await buildExportStyle(); serialized.insertBefore(style, serialized.firstChild);
    // Chromium only paints a foreignObject reliably when its direct child is
    // an XHTML root. Serializing the article directly produced a valid-sized,
    // but fully transparent PNG in headless rendering.
    const xhtmlRoot = document.createElement("div");
    xhtmlRoot.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    xhtmlRoot.style.cssText = `width:${width}px;height:${height}px;overflow:hidden;`;
    xhtmlRoot.append(serialized);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * options.scale}" height="${height * options.scale}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" height="${height}">${new XMLSerializer().serializeToString(xhtmlRoot)}</foreignObject></svg>`;
    const image = new Image();
    // A blob URL makes Chromium treat a foreignObject SVG as an opaque image
    // and taints the canvas. An encoded SVG data URL retains the document's
    // same-origin context while keeping the document self-contained.
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("문항 PNG 미리보기를 만들지 못했습니다.")); image.src = svgUrl; });
    const canvas = document.createElement("canvas"); canvas.width = width * options.scale; canvas.height = height * options.scale; const context = canvas.getContext("2d"); if (!context) throw new Error("PNG canvas를 초기화하지 못했습니다."); if (options.background === "white") { context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); } context.drawImage(image, 0, 0, canvas.width, canvas.height); return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("문항 PNG를 만들지 못했습니다.")), "image/png"));
  } finally { surface.remove(); }
}
