declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  interface PDFPageViewport {
    width: number;
    height: number;
  }

  interface PDFPageProxy {
    getViewport(options: { scale: number }): PDFPageViewport;
    render(options: {
      canvas: HTMLCanvasElement;
      canvasContext: CanvasRenderingContext2D;
      viewport: PDFPageViewport;
    }): { promise: Promise<void>; cancel(): void };
  }

  interface PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
    destroy(): Promise<void>;
  }

  interface PDFLoadingTask {
    promise: Promise<PDFDocumentProxy>;
    destroy(): Promise<void>;
  }

  export function getDocument(options: { data: Uint8Array }): PDFLoadingTask;
}
