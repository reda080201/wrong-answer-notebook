import { describe, expect, it } from "vitest";
import cases from "../../../../tools/diagram_pipeline/examples/vision-parity.json";
import example from "../../../../tools/diagram_pipeline/examples/vision-v1.json";
import { parseVisionAnalysis } from "./visionSchema";
import { createVisionJob, createVisionJobDraft, prepareOriginalVisionImport } from "./visionJob";
import JSZip from "jszip";
describe("shared vision contract", () => {
  for (const item of cases) it(item.name, () => { if (item.valid) expect(parseVisionAnalysis(item.text).schemaVersion).toBe("wrong-answer-notebook-vision-v1"); else expect(() => parseVisionAnalysis(item.text)).toThrow(); });
  it("does not reject a null number before review, or conflate same figures across entries", () => {
    const value = structuredClone(example); value.entries[0].questions[0].questionNumber = null as unknown as string;
    const entry = structuredClone(value.entries[0]); entry.entryKey = "exam-b"; value.entries.push(entry);
    const figure = structuredClone(value.figures[0]); figure.entryKey = "exam-b"; value.figures.push(figure);
    expect(parseVisionAnalysis(JSON.stringify(value)).entries).toHaveLength(2);
  });
  it("keeps multi-source physical pages separate in an original-only draft", async () => {
    const value = structuredClone(example);
    value.figures = [];
    const question = value.entries[0].questions[0]; question.contentSegments = question.contentSegments.slice(0, 1); question.figureKeys = [];
    value.sources.push({ sourceKey: "upload-2", pageCount: 1 });
    question.source = { sourceKey: "upload-2", page: 1, questionRect: question.source.questionRect };
    const files = [new File(["a"], "one.png"), new File(["b"], "two.png")];
    const prepared = await prepareOriginalVisionImport(parseVisionAnalysis(JSON.stringify(value)), files, [{ sourceKey: "upload-1", pages: [files[0]] }, { sourceKey: "upload-2", pages: [files[1]] }]);
    expect(prepared.document).toMatchObject({ entries: [{ sourcePageImages: ["two.png"], questions: [{ source: { page: 1 } }], questionSourceCrops: [{ sourcePageImage: "two.png", page: 1 }] }] });
  });
  it("refuses a different original when resuming an analysis job", async () => {
    const original = new File(["original"], "source.png");
    Object.defineProperty(original, "arrayBuffer", { value: async () => new TextEncoder().encode("original").buffer });
    const draft = await createVisionJobDraft(JSON.stringify(example), [original]);
    const changed = new File(["changed"], "source.png");
    Object.defineProperty(changed, "arrayBuffer", { value: async () => new TextEncoder().encode("changed").buffer });
    await expect(createVisionJob(JSON.stringify(example), [changed], undefined, draft.sourceFiles)).rejects.toThrow("원본 파일");
  });
  it("blocks a neighbour's figure before decoding an original crop", async () => {
    const value = structuredClone(example); value.entries[0].questions[0].source.questionRect.height = 0.05;
    await expect(prepareOriginalVisionImport(parseVisionAnalysis(JSON.stringify(value)), [new File(["original"], "page.png")])).rejects.toThrow("그림이 문항 영역");
  });
  it("rejects a job without every original file", async () => { await expect(createVisionJob(JSON.stringify(example), [])).rejects.toThrow("원본"); });
  it("exports actual immutable source bytes with a locally computed hash", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "source.png", { type: "image/png" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => new Uint8Array([1, 2, 3]).buffer });
    const result = await createVisionJob(JSON.stringify(example), [file]);
    const zip = await JSZip.loadAsync(await result.arrayBuffer());
    const job = JSON.parse(await zip.file("job.json")!.async("string"));
    expect(job.sources[0].sha256).toBe("039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81");
    expect([...await zip.file(job.sources[0].filename)!.async("uint8array")]).toEqual([1,2,3]);
    expect(job.sources[0].sourceKey).toBe("upload-1");
  });
});
