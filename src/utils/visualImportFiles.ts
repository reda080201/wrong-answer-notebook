const MAX_VISUAL_IMPORT_PAGES = 12;

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
export async function rasterizeVisualImportFile(file: File): Promise<File[]> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return [file];
  }
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  if (pdf.numPages > MAX_VISUAL_IMPORT_PAGES) {
    throw new Error(`PDF는 한 번에 ${MAX_VISUAL_IMPORT_PAGES}페이지 이하만 분석할 수 있습니다.`);
  }
  const baseName = file.name.replace(/\.pdf$/i, "");
  const pages: File[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PDF 페이지 캔버스를 준비하지 못했습니다.");
    await page.render({ canvasContext: context, viewport }).promise;
    pages.push(await canvasToFile(canvas, `${baseName}-page-${String(pageNumber).padStart(3, "0")}.png`));
  }
  return pages;
}
