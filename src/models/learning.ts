export type LearningDiagramType =
  | "derivative-tangent"
  | "absolute-value-corner"
  | "piecewise-differentiability"
  | "coordinate-graph"
  | "normal-distribution"
  | "probability-tree"
  | "venn-diagram"
  | "geometry-helper"
  | "trig-unit-circle"
  | "sequence-flow";

export type DiagramSpecParamValue =
  | string
  | number
  | boolean
  | null
  | DiagramSpecParamValue[]
  | { [key: string]: DiagramSpecParamValue };

export type DiagramSpecParams = Record<string, DiagramSpecParamValue>;

export interface DiagramSpecBase {
  type: LearningDiagramType;
  title?: string;
  xLabel?: string;
  yLabel?: string;
  highlights?: string[];
  params?: DiagramSpecParams;
}

export interface DerivativeTangentSpec extends DiagramSpecBase {
  type: "derivative-tangent";
  pointLabel?: string;
  functionLabel?: string;
  tangentLabel?: string;
  slopeLabel?: string;
}

export interface AbsoluteValueCornerSpec extends DiagramSpecBase {
  type: "absolute-value-corner";
  cornerLabel?: string;
  leftSlopeLabel?: string;
  rightSlopeLabel?: string;
}

export interface PiecewiseDifferentiabilitySpec extends DiagramSpecBase {
  type: "piecewise-differentiability";
  boundaryLabel?: string;
  leftLabel?: string;
  rightLabel?: string;
  conditionLabel?: string;
}

export interface CoordinateGraphSpec extends DiagramSpecBase {
  type: "coordinate-graph";
  curveLabel?: string;
  pointLabels?: string[];
  interceptLabel?: string;
}

export interface NormalDistributionSpec extends DiagramSpecBase {
  type: "normal-distribution";
  meanLabel?: string;
  sigmaLabels?: string[];
  shadedRegionLabel?: string;
}

export interface ProbabilityTreeSpec extends DiagramSpecBase {
  type: "probability-tree";
  rootLabel?: string;
  branchLabels?: string[];
  outcomeLabels?: string[];
}

export interface VennDiagramSpec extends DiagramSpecBase {
  type: "venn-diagram";
  setLabels?: string[];
  intersectionLabel?: string;
  outsideLabel?: string;
}

export interface GeometryHelperSpec extends DiagramSpecBase {
  type: "geometry-helper";
  shapeLabel?: string;
  angleLabels?: string[];
  lengthLabels?: string[];
}

export interface TrigUnitCircleSpec extends DiagramSpecBase {
  type: "trig-unit-circle";
  angleLabel?: string;
  sinLabel?: string;
  cosLabel?: string;
  pointLabel?: string;
}

export interface SequenceFlowSpec extends DiagramSpecBase {
  type: "sequence-flow";
  startLabel?: string;
  ruleLabel?: string;
  termLabels?: string[];
}

export type DiagramSpec =
  | DerivativeTangentSpec
  | AbsoluteValueCornerSpec
  | PiecewiseDifferentiabilitySpec
  | CoordinateGraphSpec
  | NormalDistributionSpec
  | ProbabilityTreeSpec
  | VennDiagramSpec
  | GeometryHelperSpec
  | TrigUnitCircleSpec
  | SequenceFlowSpec;

export type LearningBlockType =
  | "concept"
  | "formula"
  | "routine"
  | "warning"
  | "review"
  | "checklist"
  | "diagram";

export type LearningSubjectDomain =
  | "math"
  | "language_media"
  | "social_culture"
  | "life_ethics"
  | "general";

export type LearningImportance = "essential" | "recommended" | "reference";

export type LearningReviewStatus = "draft" | "needs_review" | "reviewed";

export interface LearningSourceReference {
  entryId: string;
  entryTitle?: string;
  questionNumber?: string;
  sourceType?: "problem" | "answer" | "solution" | "lecture" | "concept" | "manual";
}

export interface LearningChoiceExample {
  id: string;
  text: string;
  verdict?: "correct" | "incorrect" | "depends";
  reason?: string;
  isSynthetic?: boolean;
}

export interface LearningPassageExample {
  id: string;
  text: string;
  explanation?: string;
  clues?: string[];
  isSynthetic?: boolean;
}

export interface MathLearningMetadata {
  subject: "math";
  knowledgeType: "formula" | "concept" | "solution_method" | "problem_signal" | "condition_check" | "transformation" | "common_trap";
  formulaLatex?: string[];
  prerequisites?: string[];
  problemSignals?: string[];
  whenToUse?: string[];
  avoidWhen?: string[];
  solutionSteps?: string[];
  exampleOutline?: string;
}

export interface LanguageMediaLearningMetadata {
  subject: "language_media";
  knowledgeType: "concept" | "rule" | "exception" | "example" | "analysis_method" | "choice_pattern";
  area?: "language" | "media";
  rule?: string;
  exceptions?: string[];
  identificationClues?: string[];
  commonWrongClaims?: string[];
}

export interface SocialCultureLearningMetadata {
  subject: "social_culture";
  knowledgeType: "concept" | "comparison" | "passage_pattern" | "choice_pattern" | "research_method" | "data_analysis" | "common_confusion";
  definition?: string;
  judgementCriteria?: string[];
  passageClues?: string[];
  casePatterns?: string[];
  comparisonTargets?: string[];
  commonConfusions?: string[];
  dataTypes?: Array<"table" | "graph" | "research_case" | "passage" | "statistics">;
}

export interface LifeEthicsLearningMetadata {
  subject: "life_ethics";
  knowledgeType: "concept" | "thinker" | "ethical_issue" | "claim" | "comparison" | "passage_pattern" | "choice_pattern" | "common_confusion";
  thinkers?: string[];
  thinkerAliases?: string[];
  ethicalIssues?: string[];
  keyClaims?: string[];
  affirmedClaims?: string[];
  rejectedClaims?: string[];
  passageClues?: string[];
  comparisonThinkers?: string[];
  commonConfusions?: string[];
}

export type SubjectLearningMetadata =
  | MathLearningMetadata
  | LanguageMediaLearningMetadata
  | SocialCultureLearningMetadata
  | LifeEthicsLearningMetadata;

export interface LearningBlock {
  id: string;
  type: LearningBlockType;
  title: string;
  content: string;
  sourceQuestionNumber?: string;
  diagramType?: LearningDiagramType;
  diagramSpec?: DiagramSpec;
  images?: string[];
  figureIds?: string[];
  subjectDomain?: LearningSubjectDomain;
  unit?: string;
  subunit?: string;
  keywords?: string[];
  importance?: LearningImportance;
  reviewStatus?: LearningReviewStatus;
  passageExamples?: LearningPassageExample[];
  choiceExamples?: LearningChoiceExample[];
  commonTraps?: string[];
  relatedConcepts?: string[];
  sourceReferences?: LearningSourceReference[];
  subjectMetadata?: SubjectLearningMetadata;
  similarQuestionLinks?: SimilarQuestionLink[];
}

export type SimilarQuestionLinkSource = "manual" | "gemini" | "local";

export type SimilarQuestionLinkStatus = "suggested" | "approved" | "rejected";

export interface SimilarQuestionLink {
  id: string;
  targetEntryId: string;
  targetQuestionNumber: string;
  score?: number;
  reasons?: string[];
  sharedConcepts?: string[];
  differences?: string[];
  source: SimilarQuestionLinkSource;
  model?: string;
  promptVersion?: string;
  status: SimilarQuestionLinkStatus;
  createdAt: string;
  updatedAt: string;
}
