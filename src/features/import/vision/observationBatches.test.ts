import { describe, expect, it, vi } from "vitest";
import cases from "../../../../tools/diagram_pipeline/tests/fixtures/vision-v2-cases.json";
import { parseVisionAnalysis } from "./visionSchema";
import { mergeVisionObservations, observeVisionInBatches } from "./observationBatches";

function observation(key: string, number: string) {
  const value = parseVisionAnalysis(cases.find(item => item.valid)!.text);
  value.schemaVersion = "wrong-answer-notebook-vision-v1";
  value.figures = [];
  const q = value.entries[0].questions[0];
  delete q.studyAssessment;
  q.questionKey = key; q.questionNumber = number; q.figureKeys = [];
  q.contentSegments = [{ id: key, type: "text", text: `${number}번 관측` }]; q.choices = [];
  return value;
}
describe("bounded page observation", () => {
  it("preserves distinct question identities and rejects conflicting observations", () => {
    const first = observation("q1", "1"), second = observation("q2", "2");
    expect(mergeVisionObservations([first, second], first.sources).entries[0].questions.map(q => q.questionKey)).toEqual(["q1", "q2"]);
    const conflict = structuredClone(first); conflict.entries[0].questions[0].questionText = "다른 본문";
    expect(() => mergeVisionObservations([first, conflict], first.sources)).toThrow("서로 다릅니다");
  });
  it("requests at most three physical pages and resumes completed observation batches", async () => {
    const first = observation("q1", "1"), second = observation("q2", "2");
    first.sources[0].pageCount = 5; second.sources[0].pageCount = 5;
    const refs = Array.from({ length: 5 }, (_, index) => ({ sourceKey: first.sources[0].sourceKey, page: index + 1 }));
    const request = vi.fn().mockResolvedValue(JSON.stringify(second));
    const checkpoint = vi.fn().mockResolvedValue(undefined);
    const value = await observeVisionInBatches({ sources: first.sources, refs, previous: [first], signal: new AbortController().signal, request, checkpoint });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toEqual(refs.slice(3));
    expect(value.entries[0].questions).toHaveLength(2);
    expect(checkpoint).toHaveBeenLastCalledWith(expect.any(Array), expect.any(Object), true);
  });
});
