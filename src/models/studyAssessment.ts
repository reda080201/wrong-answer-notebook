/** Model observations; none of these fields authenticate a provider or approve an answer. */
export interface StudyAssessment {
  stage: "pre_package";
  evaluator: "gpt";
  assessmentStatus: "solved" | "partially_solved" | "unsolved" | "unreadable";
  solution: { proposedAnswer: string | null; summary: string; steps: string[]; strategy: string; selfCheck: string; confidence: number };
  scores: { difficulty: AssessmentScore; importance: AssessmentScore };
  classification: { subject?: string; curriculum?: string; unit?: string; subunit?: string; concepts: string[]; answerType: "multiple_choice" | "short_answer" | "essay" | "unknown" };
  learning: { importantPoints: string[]; commonTraps: string[]; reviewPoint: string };
  sourceAnswer: { status: "not_provided" | "matched" | "conflict" | "source_only" | "unreadable"; value: string | null; explanation: string | null; sourceKey?: string; page?: number };
  warnings: string[];
}
export interface AssessmentScore { value: number | null; confidence: number; reasons: string[]; }
export interface AssessmentEvidence {
  provider: "openai"; model: string; requestIds: string[]; responseHashes: string[];
  sourceHashes: string[]; completedAt: string; independent: boolean;
}
export interface AnswerProvenance {
  kind: "gpt_estimate" | "source" | "conflict" | "user_confirmed";
  proposedAnswer: string | null;
  independent: boolean;
  confirmedAt?: string;
}
