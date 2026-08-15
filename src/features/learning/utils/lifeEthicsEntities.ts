import type { LearningBlock, LifeEthicsClaim, LifeEthicsEntity, LifeEthicsJudgment } from "../../../types";

export function validateLifeEthicsEntity(entity: LifeEthicsEntity): string[] {
  const issues: string[] = [];
  if (!entity.title.trim()) issues.push("제목이 필요합니다.");
  if (!entity.sourceReferences.length) issues.push("출처가 하나 이상 필요합니다.");
  if (entity.reviewStatus === "reviewed" && issues.length) issues.push("검토 완료로 저장하기 전에 필수 항목을 채워 주세요.");
  return issues;
}

export function convertReviewedLearningBlockToLifeEthicsDraft(block: LearningBlock, now = new Date().toISOString()): LifeEthicsClaim | LifeEthicsJudgment | null {
  if (block.subjectDomain !== "life_ethics" || block.reviewStatus !== "reviewed" || !block.sourceReferences?.length) return null;
  const metadata = block.subjectMetadata?.subject === "life_ethics" ? block.subjectMetadata : undefined;
  const base = { id: crypto.randomUUID(), title: block.title, summary: block.content, sourceReferences: block.sourceReferences, reviewStatus: "draft" as const, createdAt: now, updatedAt: now };
  return metadata?.knowledgeType === "claim" ? { ...base, kind: "claim" as const, thinkerId: metadata.thinkers?.[0], polarity: metadata.rejectedClaims?.length ? "rejected" as const : "affirmed" as const } : { ...base, kind: "judgment" as const, criterion: metadata?.ethicalIssues?.join(", ") };
}
