import JSZip from "jszip";
import { parseVisionAnalysis, type VisionAnalysis } from "./visionSchema";

export async function sha256(bytes: ArrayBuffer): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(v => v.toString(16).padStart(2, "0")).join("");
}
export interface VisionJobDraft { version: 1; id: string; analysisText: string; draftAnalysisText?: string; sourceFiles: Array<{ sourceKey: string; name: string; sha256: string }>; }
export async function createVisionJobDraft(analysisText: string, files: File[]): Promise<VisionJobDraft> {
  const analysis = parseVisionAnalysis(analysisText);
  if (analysis.sources.length !== files.length) throw new Error("분석 출처와 원본 파일 수가 다릅니다.");
  const sourceFiles = [];
  for (let i = 0; i < files.length; i++) sourceFiles.push({ sourceKey: analysis.sources[i].sourceKey, name: files[i].name, sha256: await sha256(await files[i].arrayBuffer()) });
  return { version: 1, id: crypto.randomUUID(), analysisText, sourceFiles };
}
export async function createVisionJob(analysisText: string, files: File[], signal?: AbortSignal, expectedSources?: VisionJobDraft["sourceFiles"]): Promise<Blob> {
  const analysis = parseVisionAnalysis(analysisText);
  if (!files.length || files.length !== analysis.sources.length || files.length > 100) throw new Error("분석 sources 순서대로 원본 파일을 모두 선택하세요.");
  if (files.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024) throw new Error("작업 묶음은 원본 합계 100MiB 이하로 나누어 주세요.");
  const zip = new JSZip();
  const sources = [];
  for (let i = 0; i < files.length; i++) {
    signal?.throwIfAborted();
    const extension = /\.(pdf|png|jpe?g|webp)$/i.exec(files[i].name)?.[1].toLowerCase();
    if (!extension || !files[i].size) throw new Error("원본은 내용이 있는 PDF·PNG·JPEG·WebP만 지원합니다.");
    const bytes = await files[i].arrayBuffer();
    const hash = await sha256(bytes);
    if (expectedSources && (expectedSources.length !== files.length || expectedSources[i].sourceKey !== analysis.sources[i].sourceKey || expectedSources[i].sha256 !== hash)) throw new Error("원본 파일이 보존한 분석 작업과 다릅니다. 올바른 원본을 다시 선택하세요.");
    const filename = `sources/upload-${i + 1}.${extension}`;
    sources.push({ sourceKey: analysis.sources[i].sourceKey, filename, sha256: hash });
    zip.file(filename, bytes);
  }
  zip.file("job.json", JSON.stringify({ schemaVersion: "vision-import-job-v1", sources }, null, 2));
  zip.file("analysis.json", JSON.stringify(analysis, null, 2));
  signal?.throwIfAborted();
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  signal?.throwIfAborted();
  return blob;
}

/** Native analysis can still save the original crops without local Python. */
export async function prepareOriginalVisionImport(analysis: VisionAnalysis, pages: File[], sourcePages = [{ sourceKey: "upload-1", pages }], signal?: AbortSignal): Promise<{ document: Record<string, unknown>; files: File[] }> {
  if (analysis.sources.length !== sourcePages.length || analysis.sources.some((source, i) => source.sourceKey !== sourcePages[i].sourceKey || source.pageCount !== undefined && source.pageCount !== sourcePages[i].pages.length)) throw new Error("원본 페이지와 분석 출처를 확인하세요.");
  const files = [...pages];
  const page = (source: { sourceKey: string; page: number }) => {
    const group = sourcePages.find(p => p.sourceKey === source.sourceKey);
    const file = group?.pages[source.page - 1];
    if (!file) throw new Error("분석의 원본 페이지 연결이 잘못되었습니다.");
    return file.name;
  };
  const entries = [];
  for (let ei = 0; ei < analysis.entries.length; ei++) {
    signal?.throwIfAborted();
    const entry = analysis.entries[ei]; const figures = []; const questions = []; const questionSourceCrops = [];
    const linkedNames = new Set([...entry.questions.flatMap(q => [q.source, ...(q.sourceRefs ?? [])]), ...analysis.figures.filter(f => f.entryKey === entry.entryKey).map(f => f.source)].map(page));
    const entryPages = pages.filter(file => linkedNames.has(file.name));
    const ids = new Map(analysis.figures.filter(f => f.entryKey === entry.entryKey).map((f, i) => [JSON.stringify([f.questionKey, f.figureKey]), `v8_${ei}_${i}`]));
    const normalized = (number: string | null) => (number ?? "").replace(/\s|번$/g, "").replace(/^0+(?=\d)/, "");
    for (const q of entry.questions) {
      if (!q.questionNumber?.trim() || entry.questions.filter(other => normalized(other.questionNumber) === normalized(q.questionNumber)).length !== 1) throw new Error(`${q.questionKey}: 번호 미확인·중복 번호를 검토한 뒤 다시 분석하거나 CLI에서 제외해 주세요.`);
      questions.push({ questionNumber: q.questionNumber, questionText: q.questionText, contentSegments: q.contentSegments.map(segment => { if (segment.type !== "figure") return segment; const { figureKey, ...rest } = segment; return { ...rest, figureId: ids.get(JSON.stringify([q.questionKey, figureKey])) }; }), choices: q.choices.map(choice => choice.replace(/\[FIGURE:([^\]]+)\]/g, (_, key: string) => `[FIGURE:${ids.get(JSON.stringify([q.questionKey, key]))}]`)), source: { page: entryPages.findIndex(p => p.name === page(q.source)) + 1 }, needsReview: true });
      for (const [ordinal, reference] of [q.source, ...(q.sourceRefs ?? [])].entries()) {
        const filename = page(reference);
        questionSourceCrops.push({ id: `v8_question_${ei}_${questions.length}_${ordinal}`, questionNumber: q.questionNumber, image: filename, sourcePageImage: filename, page: entryPages.findIndex(p => p.name === filename) + 1, cropRect: { x: 0, y: 0, width: 1, height: 1 } });
      }
    }
    for (const f of analysis.figures.filter(f => f.entryKey === entry.entryKey)) {
      signal?.throwIfAborted();
      const owner = entry.questions.find(q => q.questionKey === f.questionKey)!;
      const questionRect = owner.source.questionRect;
      const figureRect = f.source.rect;
      if (questionRect && owner.source.sourceKey === f.source.sourceKey && owner.source.page === f.source.page && !(figureRect.x >= questionRect.x && figureRect.y >= questionRect.y && figureRect.x + figureRect.width <= questionRect.x + questionRect.width && figureRect.y + figureRect.height <= questionRect.y + questionRect.height)) throw new Error(`${owner.questionKey}: 그림이 문항 영역을 벗어납니다. 위치를 검토한 뒤 작업 묶음으로 다시 처리하세요.`);
      const filename = page(f.source); const id = ids.get(JSON.stringify([f.questionKey, f.figureKey]))!;
      const bitmap = await createImageBitmap(pages.find(p => p.name === filename)!, { imageOrientation: "from-image" });
      try {
        signal?.throwIfAborted();
        const rect = f.source.rect;
        const x = Math.floor(rect.x * bitmap.width), y = Math.floor(rect.y * bitmap.height);
        const width = Math.ceil((rect.x + rect.width) * bitmap.width) - x, height = Math.ceil((rect.y + rect.height) * bitmap.height) - y;
        if (width < 1 || height < 1) throw new Error("그림 영역이 너무 작습니다.");
        const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
        const context = canvas.getContext("2d"); if (!context) throw new Error("그림 원본을 읽을 수 없습니다.");
        context.drawImage(bitmap, x, y, width, height, 0, 0, width, height);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("원본 crop 생성 실패")), "image/png"));
        signal?.throwIfAborted();
        const cropName = `${id}-original.png`; files.push(new File([blob], cropName, { type: "image/png" }));
        figures.push({ id, questionNumber: entry.questions.find(q => q.questionKey === f.questionKey)!.questionNumber, original: { image: cropName, sourcePageImage: filename, crop: rect }, image: cropName, source: "original", preferredRepresentation: "original", needsReview: true, processingStatus: "needs_review" });
      } finally { bitmap.close(); }
    }
    entries.push({ entryKind: "problem_sheet", title: entry.title, subject: entry.subject, questions, figures, questionSourceCrops, answerKey: entry.questions.filter(q => q.extractedAnswer || q.explanationDraft).map((q, index) => ({ id: `v8_answer_${ei}_${index}`, questionNumber: q.questionNumber, answer: q.extractedAnswer ?? "", explanation: q.explanationDraft ?? "", importantPoints: [], needsReview: true, processingStatus: "needs_review" })), sourcePageImages: entryPages.map(p => p.name) });
  }
  return { document: { schemaVersion: "wrong-answer-notebook-import-v2", importType: "problem_sheet", entries }, files };
}
