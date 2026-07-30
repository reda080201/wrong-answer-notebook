import { v4 as uuidv4 } from "uuid";
import type { LearningBlock, LearningReviewStatus, WrongAnswerEntry } from "../../../types";

export interface LearningCandidate {
  id: string;
  sourceEntryId: string;
  sourceQuestionNumber?: string;
  block: LearningBlock;
  status: LearningReviewStatus;
  reason: string;
}

function candidate(entry: WrongAnswerEntry, sourceQuestionNumber: string | undefined, type: LearningBlock["type"], title: string, content: string, reason: string): LearningCandidate {
  return {
    id: uuidv4(),
    sourceEntryId: entry.id,
    sourceQuestionNumber,
    status: "draft",
    reason,
    block: {
      id: uuidv4(),
      type,
      title,
      content,
      sourceQuestionNumber,
      subjectDomain: undefined,
      importance: "reference",
      reviewStatus: "draft",
      sourceReferences: [{ entryId: entry.id, entryTitle: entry.title, questionNumber: sourceQuestionNumber, sourceType: entry.entryKind === "lecture" ? "lecture" : "answer" }],
    },
  };
}

export function buildLearningCandidates(entry: WrongAnswerEntry): LearningCandidate[] {
  const candidates: LearningCandidate[] = [];
  for (const item of entry.answerKey ?? []) {
    const number = item.questionNumber.trim() || undefined;
    if (item.concepts?.length) candidates.push(candidate(entry, number, "concept", `${number ? `${number}번 ` : ""}핵심 개념`, item.concepts.join("\n"), "답안의 개념 필드에서 추출"));
    if (item.strategy?.trim()) candidates.push(candidate(entry, number, "routine", `${number ? `${number}번 ` : ""}풀이 전략`, item.strategy.trim(), "답안의 풀이 전략에서 추출"));
    if (item.steps?.length) candidates.push(candidate(entry, number, "routine", `${number ? `${number}번 ` : ""}풀이 단계`, item.steps.map((step, index) => `${index + 1}. ${step}`).join("\n"), "답안의 단계별 풀이에서 추출"));
    if (item.wrongPoint?.trim() || item.importantPoints.length) candidates.push(candidate(entry, number, "warning", `${number ? `${number}번 ` : ""}오답 포인트`, item.wrongPoint?.trim() || item.importantPoints.join("\n"), "답안의 오답 포인트에서 추출"));
    if (item.reviewPoint?.trim()) candidates.push(candidate(entry, number, "review", `${number ? `${number}번 ` : ""}복습 포인트`, item.reviewPoint.trim(), "답안의 복습 포인트에서 추출"));
  }
  return candidates;
}

export function filterNewLearningCandidates(entry: WrongAnswerEntry, candidates: LearningCandidate[]): LearningCandidate[] {
  const existing = new Set((entry.learningBlocks ?? []).map((block) => `${block.sourceQuestionNumber ?? ""}|${block.type}|${block.title.trim().toLocaleLowerCase("ko-KR")}`));
  return candidates.filter((candidateItem) => !existing.has(`${candidateItem.block.sourceQuestionNumber ?? ""}|${candidateItem.block.type}|${candidateItem.block.title.trim().toLocaleLowerCase("ko-KR")}`));
}
