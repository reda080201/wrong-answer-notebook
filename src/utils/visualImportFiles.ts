const MAX_VISUAL_IMPORT_PAGES = 12;

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
  throwIfAborted();
  if (pdf.numPages > MAX_VISUAL_IMPORT_PAGES) {
    await pdf.destroy();
    throw new Error(`PDF는 한 번에 ${MAX_VISUAL_IMPORT_PAGES}페이지 이하만 분석할 수 있습니다.`);
  }
  const baseName = file.name.replace(/\.pdf$/i, "");
  const pages: File[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      throwIfAborted();
      options.onProgress?.({ phase: "rasterize", current: pageNumber - 1, total: pdf.numPages });
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
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
      options.onProgress?.({ phase: "rasterize", current: pageNumber, total: pdf.numPages });
    }
    return pages;
  } finally {
    await pdf.destroy();
  }
}
