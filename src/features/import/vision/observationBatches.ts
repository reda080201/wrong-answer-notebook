import { parseVisionAnalysis, type VisionAnalysis, type VisionQuestion } from "./visionSchema";

export function mergeVisionObservations(parts: VisionAnalysis[], sources: VisionAnalysis["sources"]): VisionAnalysis {
  if (!parts.length) throw new Error("원본 관측 결과가 없습니다.");
  const merged = structuredClone(parts[0]);
  merged.sources = sources;
  merged.document.pageCount = sources.reduce((sum, source) => sum + (source.pageCount ?? 0), 0);
  merged.entries = []; merged.figures = [];
  merged.audit = { detectedQuestionNumbers: [], missingQuestionNumbers: [], uncertainQuestionNumbers: [], warnings: [] };
  for (const part of parts) {
    for (const source of part.sources) if (!sources.some(expected => expected.sourceKey === source.sourceKey && (source.pageCount === undefined || source.pageCount === expected.pageCount))) throw new Error("관측의 원본 페이지 대응이 실제 파일과 다릅니다.");
    for (const entry of part.entries) {
      const target = merged.entries.find(item => item.entryKey === entry.entryKey);
      if (!target) { merged.entries.push(structuredClone(entry)); continue; }
      target.rejectedNotes = [...new Set([...(target.rejectedNotes ?? []), ...(entry.rejectedNotes ?? [])])];
      target.importantNotes = [...new Set([...(target.importantNotes ?? []), ...(entry.importantNotes ?? [])])];
      for (const q of entry.questions) {
        const previous = target.questions.find(item => item.questionKey === q.questionKey);
        if (!previous) target.questions.push(structuredClone(q));
        else if (JSON.stringify(previous) !== JSON.stringify(q)) throw new Error(`${entry.entryKey}/${q.questionKey}: 페이지 경계의 관측이 서로 다릅니다. 원본을 보존하고 문항 연결을 검토하세요.`);
      }
    }
    for (const f of part.figures) {
      const previous = merged.figures.find(item => item.entryKey === f.entryKey && item.questionKey === f.questionKey && item.figureKey === f.figureKey);
      if (!previous) merged.figures.push(structuredClone(f));
      else if (JSON.stringify(previous) !== JSON.stringify(f)) throw new Error("그림의 페이지 경계 관측을 확인하세요.");
    }
    for (const key of Object.keys(merged.audit) as Array<keyof VisionAnalysis["audit"]>) merged.audit[key] = [...new Set([...merged.audit[key], ...part.audit[key]])];
  }
  merged.audit.missingQuestionNumbers = merged.audit.missingQuestionNumbers.filter(number => !merged.audit.detectedQuestionNumbers.includes(number));
  return parseVisionAnalysis(JSON.stringify(merged));
}

export async function observeVisionInBatches(options: {
  sources: VisionAnalysis["sources"]; refs: VisionQuestion["source"][]; previous?: VisionAnalysis[]; signal: AbortSignal;
  request(refs: VisionQuestion["source"][], prompt: string): Promise<string>;
  checkpoint(parts: VisionAnalysis[], merged: VisionAnalysis, completed: boolean): Promise<void>;
}): Promise<VisionAnalysis> {
  const parts = [...(options.previous ?? [])];
  for (let offset = parts.length * 3; offset < options.refs.length; offset += 3) {
    options.signal.throwIfAborted();
    const refs = options.refs.slice(offset, offset + 3);
    const part = parseVisionAnalysis(await options.request(refs, `첨부한 물리 페이지 대응: ${JSON.stringify(refs)}. sources는 앱이 발급한 실제 sourceKey/pageCount만 사용하세요. 문항의 실제 시작 페이지와 인쇄 번호로 안정된 questionKey를 만드세요. 같은 자료의 entryKey는 페이지가 바뀌어도 유지하세요. 다른 sourceKey의 자료를 같은 entry로 합치지 마세요. 첨부되지 않은 페이지의 내용은 생성하지 마세요.`));
    options.signal.throwIfAborted();
    if (part.schemaVersion !== "wrong-answer-notebook-vision-v1") throw new Error("관측 단계에는 풀이·평가 이전의 vision-v1 결과만 사용할 수 있습니다.");
    parts.push(part);
    await options.checkpoint(parts, mergeVisionObservations(parts, options.sources), offset + 3 >= options.refs.length);
  }
  return mergeVisionObservations(parts, options.sources);
}
