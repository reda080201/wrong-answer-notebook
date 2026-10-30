import { v5 as uuidv5 } from "uuid";
import type { LearningBlock } from "../../../types";
import type { VisionAnalysis } from "./visionSchema";
export function mapAssessmentLearning(entry: VisionAnalysis["entries"][number]): LearningBlock[] {
  const seen = new Set<string>();
  return entry.questions.flatMap(question => (question.studyAssessment?.learning.candidates ?? []).flatMap(candidate => {
    const content = candidate.content.normalize("NFKC").trim().replace(/\s+/g, " ");
    if (!content || !candidate.title.trim()) return [];
    const id = "vision_" + uuidv5(JSON.stringify([entry.entryKey, question.questionKey, candidate.type, content]), uuidv5.URL);
    if (seen.has(id)) return []; seen.add(id);
    return [{ ...candidate, id, title: candidate.title.trim(), content: candidate.content.trim(), sourceQuestionNumber: question.questionNumber ?? undefined, reviewStatus: "draft" as const }];
  }));
}
