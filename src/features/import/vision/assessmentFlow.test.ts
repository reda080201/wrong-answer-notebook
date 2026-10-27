import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import cases from "../../../../tools/diagram_pipeline/tests/fixtures/vision-v2-cases.json";
import { parseVisionAnalysis } from "./visionSchema";
import { runPrepackageAssessment, type AssessmentStageCache } from "./assessmentFlow";
import type { VisionProviderReceipt } from "../../../services/api/ai";

beforeEach(async () => vi.stubGlobal("crypto", (await vi.importActual<{ webcrypto: Crypto }>("node:crypto")).webcrypto));
afterEach(() => vi.unstubAllGlobals());
const fixture = () => parseVisionAnalysis(cases.find(item => item.valid)!.text);
const receipt = (value: unknown): VisionProviderReceipt => ({ text: JSON.stringify(value), provider: "openai", model: "gpt-fixture", providerRequestId: "fixture-response", requestId: "fixture-request", responseHash: "a".repeat(64), completedAtMs: Date.parse("2026-10-27T00:00:00Z") });

describe("pre-package assessment order", () => {
  it("rejects unsupported printed metadata at the answer stage instead of silently dropping it", async () => {
    const value = fixture(), a = value.entries[0].questions[0].studyAssessment!;
    delete value.entries[0].questions[0].studyAssessment;
    value.schemaVersion = "wrong-answer-notebook-vision-v1";
    const request = vi.fn().mockResolvedValueOnce(receipt({ assessmentStatus: a.assessmentStatus, solution: a.solution, warnings: [] }))
      .mockResolvedValueOnce(receipt({ scores: a.scores, classification: a.classification, learning: a.learning }))
      .mockResolvedValueOnce(receipt({ sourceAnswer: { status: "unreadable", value: null, explanation: null, intent: "근거 없는 의도" } }));
    const progress = vi.fn();
    await expect(runPrepackageAssessment(value, request, { answerRefs: [{ sourceKey: "upload-1", page: 1 }], independent: true, signal: new AbortController().signal, progress })).rejects.toThrow("printed metadata");
    expect(progress).not.toHaveBeenCalledWith("prepackage_validated");
  });
  it("seals solution and scores before allowing answer-bearing input", async () => {
    const value = fixture(), a = value.entries[0].questions[0].studyAssessment!;
    delete value.entries[0].questions[0].studyAssessment; value.schemaVersion = "wrong-answer-notebook-vision-v1";
    const request = vi.fn().mockResolvedValueOnce(receipt({ assessmentStatus: a.assessmentStatus, solution: a.solution, warnings: [] })).mockResolvedValueOnce(receipt({ scores: a.scores, classification: a.classification, learning: a.learning })).mockResolvedValueOnce(receipt({ sourceAnswer: a.sourceAnswer }));
    value.entries[0].questions[0].extractedAnswer = "노출된 답";
    const progress = vi.fn();
    const result = await runPrepackageAssessment(value, request, { answerRefs: [{ sourceKey: "upload-1", page: 1 }], independent: true, signal: new AbortController().signal, progress });
    expect(request).toHaveBeenCalledTimes(3);
    expect(result.evidence.independent).toBe(false);
    expect(JSON.parse(request.mock.calls[0][1])).not.toHaveProperty("sourceAnswer");
    expect(request.mock.calls[2][0]).toContain("이제 첨부 답안지");
    expect(result.analysis.entries[0].questions[0].studyAssessment?.sourceAnswer.status).toBe("conflict");
    expect(progress).toHaveBeenLastCalledWith("prepackage_validated");
  });
  it("does not reach generation-ready after a failed stage and reuses completed requests on retry", async () => {
    const value = fixture(), a = value.entries[0].questions[0].studyAssessment!;
    delete value.entries[0].questions[0].studyAssessment; value.schemaVersion = "wrong-answer-notebook-vision-v1";
    let cache: AssessmentStageCache = {};
    const request = vi.fn().mockResolvedValueOnce(receipt({ assessmentStatus: a.assessmentStatus, solution: a.solution, warnings: [] })).mockRejectedValueOnce(new Error("provider unavailable"));
    const progress = vi.fn();
    const options = { answerRefs: [], independent: true, signal: new AbortController().signal, progress, checkpoint: async (_a: unknown, _e: unknown, next: AssessmentStageCache) => { cache = { ...next }; } };
    await expect(runPrepackageAssessment(value, request, options)).rejects.toThrow("provider unavailable");
    expect(progress).not.toHaveBeenCalledWith("prepackage_validated");
    const retry = vi.fn().mockResolvedValue(receipt({ scores: a.scores, classification: a.classification, learning: a.learning }));
    const done = await runPrepackageAssessment(value, retry, { ...options, cache });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(done.analysis.entries[0].questions[0].studyAssessment?.sourceAnswer.status).toBe("not_provided");
  });
  it("rejects a non-GPT transport result and ignores completion after cancellation", async () => {
    const value = fixture();
    const controller = new AbortController();
    await expect(runPrepackageAssessment(value, async () => ({ ...receipt({}), provider: "gemini" } as unknown as VisionProviderReceipt), { answerRefs: [], independent: false, signal: controller.signal, progress: vi.fn() })).rejects.toThrow("GPT 실행 출처");
    await expect(runPrepackageAssessment(value, async () => { controller.abort(); return receipt({}); }, { answerRefs: [], independent: false, signal: controller.signal, progress: vi.fn() })).rejects.toThrow();
  });
});
