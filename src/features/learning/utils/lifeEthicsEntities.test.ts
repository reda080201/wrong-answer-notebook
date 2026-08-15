import { describe, expect, it } from "vitest";
import { convertReviewedLearningBlockToLifeEthicsDraft, validateLifeEthicsEntity } from "./lifeEthicsEntities";

describe("life ethics entities", () => {
  it("requires source references and creates only reviewed block drafts", () => {
    const block = { id: "b", type: "concept" as const, title: "정의", content: "내용", subjectDomain: "life_ethics" as const, reviewStatus: "reviewed" as const, sourceReferences: [{ entryId: "e", sourceType: "manual" as const }] };
    const draft = convertReviewedLearningBlockToLifeEthicsDraft(block, "2026-01-01T00:00:00.000Z");
    expect(draft?.reviewStatus).toBe("draft");
    expect(validateLifeEthicsEntity({ ...draft!, sourceReferences: [] })).toContain("출처가 하나 이상 필요합니다.");
    expect(convertReviewedLearningBlockToLifeEthicsDraft({ ...block, reviewStatus: "needs_review" })).toBeNull();
  });
});
