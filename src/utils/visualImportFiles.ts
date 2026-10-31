import { IMPORT_LIMITS } from "../features/import/services/importLimits";
const MAX_VISUAL_IMPORT_PAGES = 12;

export function validatePdfViewport(width: number, height: number, pageNumber: number) {
  const w = Math.ceil(width), h = Math.ceil(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0
    || w > IMPORT_LIMITS.MAX_IMAGE_DIMENSION || h > IMPORT_LIMITS.MAX_IMAGE_DIMENSION
    || w * h > IMPORT_LIMITS.MAX_IMAGE_PIXELS || w * h * 4 > IMPORT_LIMITS.MAX_IMAGE_DECODED_BYTES) {
    throw new Error(`PDF ${pageNumber}페이지의 크기가 안전한 렌더 범위를 벗어났습니다. 페이지 크기를 줄여 다시 선택하세요.`);
  }
  return { width: w, height: h };
}

export interface VisualImportProgress {
  phase: "rasterize";
  current: number;
  total?: number;
  indeterminate?: boolean;
}

function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("PDF 페이지 이미지를 만들지 못했습니다."));
        return;
      }
      resolve(new File([blob], name, { type: "image/png" }));
    }, "image/png");
  });
}

/** Converts a PDF into immutable page evidence before it enters AI analysis. */
export async function rasterizeVisualImportFile(
  file: File,
  options: { signal?: AbortSignal; onProgress?: (progress: VisualImportProgress) => void } = {},
): Promise<File[]> {
  const throwIfAborted = () => {
    if (options.signal?.aborted) throw new DOMException("파일 분석을 취소했습니다.", "AbortError");
  };
  throwIfAborted();
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    options.onProgress?.({ phase: "rasterize", current: 1, total: 1 });
    return [file];
  }
  options.onProgress?.({ phase: "rasterize", current: 0, indeterminate: true });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  throwIfAborted();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const cancelLoading = () => { void loadingTask.destroy(); };
  options.signal?.addEventListener("abort", cancelLoading, { once: true });
  let pdf: Awaited<typeof loadingTask.promise>;
  try {
    pdf = await loadingTask.promise;
  } finally {
    options.signal?.removeEventListener("abort", cancelLoading);
  }
  const baseName = file.name.replace(/\.pdf$/i, "");
  const pages: File[] = [];
  try {
    throwIfAborted();
    if (pdf.numPages > MAX_VISUAL_IMPORT_PAGES) throw new Error(`PDF는 한 번에 ${MAX_VISUAL_IMPORT_PAGES}페이지 이하만 분석할 수 있습니다.`);
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      throwIfAborted();
      options.onProgress?.({ phase: "rasterize", current: pageNumber - 1, total: pdf.numPages });
      const page = await pdf.getPage(pageNumber);
      let canvas: HTMLCanvasElement | undefined;
      try {
      const viewport = page.getViewport({ scale: 1.5 });
      const size = validatePdfViewport(viewport.width, viewport.height, pageNumber);
      throwIfAborted();
      canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("PDF 페이지 캔버스를 준비하지 못했습니다.");
      const renderTask = page.render({ canvas, canvasContext: context, viewport });
      const cancelRender = () => renderTask.cancel();
      options.signal?.addEventListener("abort", cancelRender, { once: true });
      try {
        await renderTask.promise;
      } finally {
        options.signal?.removeEventListener("abort", cancelRender);
      }
      throwIfAborted();
      pages.push(await canvasToFile(canvas, `${baseName}-page-${String(pageNumber).padStart(3, "0")}.png`));
      throwIfAborted();
      options.onProgress?.({ phase: "rasterize", current: pageNumber, total: pdf.numPages });
      } finally {
        if (canvas) { canvas.width = 0; canvas.height = 0; }
        page.cleanup();
      }
    }
    return pages;
  } finally {
    await pdf.destroy();
  }
}
