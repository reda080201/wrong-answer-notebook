export interface QuestionPngOptions {
  background: "white" | "transparent";
  scale: 1 | 2 | 3;
  filename: string;
}

export const DEFAULT_QUESTION_PNG_OPTIONS: QuestionPngOptions = {
  background: "white",
  scale: 2,
  filename: "question.png",
};

export function canonicalQuestionFingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `q-${(hash >>> 0).toString(16)}`;
}

function copyStyles(from: Element, to: Element) {
  const style = window.getComputedStyle(from);
  const declaration = Array.from(style).map((name) => `${name}:${style.getPropertyValue(name)};`).join("");
  to.setAttribute("style", declaration);
  for (let index = 0; index < from.children.length; index += 1) copyStyles(from.children[index], to.children[index]);
}

/** Renders only a canonical question surface. Toolbars and app chrome are never cloned. */
export async function renderQuestionNodeToPng(node: HTMLElement, options: QuestionPngOptions): Promise<Blob> {
  const clone = node.cloneNode(true) as HTMLElement;
  copyStyles(node, clone);
  clone.style.width = `${Math.ceil(node.getBoundingClientRect().width)}px`;
  clone.style.background = options.background === "white" ? "#ffffff" : "transparent";
  const width = Math.max(1, Math.ceil(node.getBoundingClientRect().width));
  const height = Math.max(1, Math.ceil(node.getBoundingClientRect().height));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * options.scale}" height="${height * options.scale}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(clone)}</foreignObject></svg>`;
  const image = new Image();
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("문항 PNG 미리보기를 만들지 못했습니다.")); image.src = svgUrl; });
    const canvas = document.createElement("canvas");
    canvas.width = width * options.scale;
    canvas.height = height * options.scale;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PNG canvas를 초기화하지 못했습니다.");
    if (options.background === "white") { context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height); }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("문항 PNG를 만들지 못했습니다.")), "image/png"));
  } finally { URL.revokeObjectURL(svgUrl); }
}

export function downloadQuestionPng(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
