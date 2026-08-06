import { describe, expect, it } from "vitest";
import type { SimilarQuestionRankingRequest } from "../../features/question-bank/utils/similarQuestionLinks";
import fixture from "../../../tests/fixtures/similar-question-ranking-request.json";

describe("similar-question ranking shared fixture", () => {
  it("matches the TypeScript request shape used by the Tauri adapter", () => {
    const request = fixture as SimilarQuestionRankingRequest;

    expect(request.context.sourceId).toBe("source-entry");
    expect(request.context.sourceQuestionNumber).toBe("03");
    expect(request.context.solutionMethods).toEqual(["조건을 먼저 확인"]);
    expect(request.candidates[0]).toMatchObject({
      candidateId: "candidate:1",
      hasExplanation: true,
      explanation: "도함수의 정의를 적용한다.",
    });
  });
});
