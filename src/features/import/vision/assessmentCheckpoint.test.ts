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
