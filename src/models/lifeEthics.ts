import type { LearningSourceReference } from "./learning";

export type LifeEthicsEntityKind = "thinker" | "concept" | "claim" | "judgment";
export type LifeEthicsReviewStatus = "draft" | "needs_review" | "reviewed";

export interface LifeEthicsEntityBase {
  id: string;
  kind: LifeEthicsEntityKind;
  title: string;
  summary?: string;
  sourceReferences: LearningSourceReference[];
  reviewStatus: LifeEthicsReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LifeEthicsThinker extends LifeEthicsEntityBase { kind: "thinker"; aliases?: string[]; }
export interface LifeEthicsConcept extends LifeEthicsEntityBase { kind: "concept"; relatedThinkerIds?: string[]; }
export interface LifeEthicsClaim extends LifeEthicsEntityBase { kind: "claim"; thinkerId?: string; conceptId?: string; polarity?: "affirmed" | "rejected" | "conditional"; }
export interface LifeEthicsJudgment extends LifeEthicsEntityBase { kind: "judgment"; claimId?: string; criterion?: string; }
export type LifeEthicsEntity = LifeEthicsThinker | LifeEthicsConcept | LifeEthicsClaim | LifeEthicsJudgment;
