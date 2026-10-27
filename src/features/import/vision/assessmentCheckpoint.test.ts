import { afterEach, beforeEach, expect, it, vi } from "vitest";
import cases from "../../../../tools/diagram_pipeline/tests/fixtures/vision-v2-cases.json";
import { parseVisionAnalysis } from "./visionSchema";
import { clearAssessmentCheckpoint, readAssessmentCheckpoint, writeAssessmentCheckpoint, type AssessmentCheckpoint } from "./assessmentCheckpoint";

beforeEach(() => { vi.restoreAllMocks(); clearAssessmentCheckpoint(); });
afterEach(() => { vi.restoreAllMocks(); clearAssessmentCheckpoint(); });
const fixture = (): AssessmentCheckpoint => ({ version: 1, sourceHashes: ["source-sha:problem"], analysis: parseVisionAnalysis(cases.find(item => item.valid)!.text), cache: {}, evidence: { independent: false, stages: [] } });

it("retains the newest in-memory assessment when storage fails and retries the same record", () => {
  const record = fixture();
  const fail = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  expect(() => writeAssessmentCheckpoint(record)).toThrow("현재 창에 유지");
  expect(readAssessmentCheckpoint(record.sourceHashes)?.analysis).toEqual(record.analysis);
  expect(() => readAssessmentCheckpoint(["source-sha", "new-role"], 1)).toThrow("저장하지 못한 평가");
  fail.mockRestore();
  writeAssessmentCheckpoint(record);
  expect(readAssessmentCheckpoint(record.sourceHashes)?.analysis).toEqual(record.analysis);
});

it("blocks a different original or role instead of replacing the saved assessment", () => {
  const record = fixture();
  writeAssessmentCheckpoint(record);
  expect(() => readAssessmentCheckpoint(["source-sha:answer"])).toThrow("다른 원본");
  expect(readAssessmentCheckpoint(record.sourceHashes)?.analysis).toEqual(record.analysis);
});
it("archives role-bound results without reusing an old role's requests or stale current data", () => {
  const a = { ...fixture(), sourceHashes: ["sha", "roles-a"] };
  writeAssessmentCheckpoint(a);
  expect(readAssessmentCheckpoint(["sha", "roles-b"], 1)).toBeUndefined();
  writeAssessmentCheckpoint({ ...a, sourceHashes: ["sha", "roles-b"] });
  expect(readAssessmentCheckpoint(a.sourceHashes)?.sourceHashes).toEqual(a.sourceHashes);
  a.analysis.document.title = "updated";
  writeAssessmentCheckpoint(a);
  expect(readAssessmentCheckpoint(a.sourceHashes)?.analysis.document.title).toBe("updated");
});
