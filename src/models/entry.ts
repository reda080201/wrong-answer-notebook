import type { Annotation } from "./shared";
import type { DiagramSpec, LearningBlock, LearningDiagramType, SimilarQuestionLink } from "./learning";
import type { ChecklistItem, MistakeAnalysis, ReviewAttempt, ReviewState } from "./review";

/** 오답 한 건 vs 문제지(전체) 보관 vs 개념 vs 특강자료 */
export type EntryKind = "wrong_answer" | "problem_sheet" | "concept" | "lecture";

export type LectureSourceType = "html" | "md" | "txt" | "json";

export type Difficulty = "high" | "medium" | "low" | "none";

/** 문제 문서 형태와 별개로, 문제의 실제 출처를 분류합니다. */
export type ProblemSourceType =
  | "past_exam"
  | "mock_exam"
  | "n_series"
  | "worksheet"
  | "textbook"
  | "ebs"
  | "school_exam"
  | "self_made"
  | "ai_generated"
  | "unknown";

export interface ProblemSourceInfo {
  type: ProblemSourceType;
  publisher?: string;
  seriesName?: string;
  examName?: string;
  examYear?: number;
  examMonth?: number;
  examRound?: string;
  organization?: string;
  teacher?: string;
  isOfficial?: boolean;
  sourceLabel?: string;
}

export type QuestionDifficultySource = "manual" | "imported" | "heuristic" | "gemini";

export type QuestionAnswerType = "multiple_choice" | "short_answer" | "essay" | "unknown";

/**
 * 문항 단위의 분류 정보입니다. 점수는 기존 QuestionMeta 위치를 canonical source로 사용합니다.
 */
export interface QuestionClassification {
  subject?: string;
  curriculum?: string;
  unit?: string;
  subunit?: string;
  concepts?: string[];
  sourceType?: ProblemSourceType;
  difficultySource?: QuestionDifficultySource;
  answerType?: QuestionAnswerType;
  points?: number;
  tags?: string[];
}

export interface ExplanationPart {
  id: string;
  text: string;
  images: string[];
}

export interface SheetAnswerItem {
  id: string;
  questionNumber: string;
  answer: string;
  explanation: string;
  strategy?: string;
  steps?: string[];
  choiceJudgements?: Array<{ marker: string; text: string }>;
  wrongPoint?: string;
  reviewPoint?: string;
  notes?: string;
  mistakeAnalysis?: MistakeAnalysis;
  importantPoints: string[];
  difficulty?: Difficulty;
  difficultyScore?: number;
  concepts?: string[];
  diagramType?: LearningDiagramType;
  diagramSpec?: DiagramSpec;
  needsReview?: boolean;
  sourceNote?: string;
}

export type SupplementalResourceKind =
  | "answer_key"
  | "solution"
  | "correction"
  | "source_pages"
  | "lecture"
  | "concept"
  | "other";

export type SupplementalAppliedField =
  | "answerKey"
  | "explanationParts"
  | "figures"
  | "sourcePageImages"
  | "learningBlocks";

export interface SupplementalResource {
  id: string;
  kind: SupplementalResourceKind;
  title: string;
  createdAt: string;
  updatedAt: string;
  sourceFilename?: string;
  sourceEntryId?: string;
  questionNumbers?: string[];
  images?: string[];
  appliedFields?: SupplementalAppliedField[];
  [key: string]: unknown;
}

export interface SheetFigureItem {
  id: string;
  questionNumber: string;
  title: string;
  caption: string;
  image?: string;
  source: "original" | "gpt_cleaned" | "described_only";
  needsReview?: boolean;
  original?: FigureOriginalRepresentation;
  cleaned?: FigureCleanedRepresentation;
  semanticSpec?: DiagramSemanticSpec;
  verification?: FigureVerification;
  preferredRepresentation?: FigurePreferredRepresentation;
  /** Prevents later automatic verification from replacing an explicit user choice. */
  representationSelectionSource?: "automatic" | "user";
  placement?: {
    questionNumber: string;
    afterSegmentId?: string;
    beforeChoiceIndex?: number;
    order?: number;
  };
}

export interface NormalizedCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FigureOriginalRepresentation {
  image: string;
  sourcePageImage?: string;
  crop?: NormalizedCrop;
}

export interface FigureCleanedRepresentation {
  image: string;
  generatedBy: "gpt";
  generatedAt: string;
  sourceImageHash: string;
  promptVersion: string;
}

export type DiagramSemanticType =
  | "function_graph"
  | "coordinate_geometry"
  | "plane_geometry"
  | "solid_geometry"
  | "probability_tree"
  | "table"
  | "venn_diagram"
  | "number_line"
  | "sequence_diagram"
  | "custom_math_diagram";

export interface DiagramSemanticSpec {
  type: DiagramSemanticType;
  points?: Array<{ id: string; label?: string; x?: number; y?: number }>;
  segments?: Array<{ id?: string; from: string; to: string; style?: "solid" | "dashed" }>;
  circles?: Array<{ id: string; center?: string; radius?: number }>;
  curves?: Array<Record<string, unknown>>;
  equations?: string[];
  axes?: Array<Record<string, unknown>>;
  regions?: Array<Record<string, unknown>>;
  labels?: Array<{ id?: string; text: string; targetId?: string }>;
  numericValues?: Array<{ targetId?: string; value: string }>;
  relations?: Array<{
    type: "point_on_line" | "point_on_segment" | "point_on_circle" | "collinear" | "parallel" | "perpendicular" | "tangent" | "equal_length" | "equal_angle" | "midpoint" | "intersection" | "inside" | "outside" | "connected" | "open_point" | "closed_point";
    targets: string[];
    confidence?: number;
  }>;
  constraints?: string[];
  warnings?: string[];
  confidence?: number;
}

export type FigurePreferredRepresentation = "cleaned" | "semantic_render" | "original";

export type FigureVerificationIssueType =
  | "missing_point" | "wrong_label" | "missing_segment" | "wrong_intersection"
  | "wrong_tangency" | "wrong_line_style" | "wrong_relation_mark"
  | "wrong_numeric_value" | "wrong_open_closed_point" | "wrong_shading"
  | "wrong_graph_feature" | "text_figure_conflict" | "other";

export interface FigureVerificationIssue {
  type: FigureVerificationIssueType;
  message: string;
  targetId?: string;
}

export interface FigureVerification {
  status: "verified" | "needs_review" | "rejected";
  confidence: number;
  checks: {
    pointLabelsMatch?: boolean;
    topologyMatch?: boolean;
    lineStylesMatch?: boolean;
    relationMarksMatch?: boolean;
    numericLabelsMatch?: boolean;
    graphFeaturesMatch?: boolean;
    shadingMatch?: boolean;
    textConditionMatch?: boolean;
    visualLayoutPreserved?: boolean;
  };
  blockingIssues: FigureVerificationIssue[];
  warnings: FigureVerificationIssue[];
  userApproved?: boolean;
  verificationSource?: "gpt_self_check" | "second_pass_model" | "local_validator" | "user";
  verifiedAt?: string;
  verifier?: string;
}

export type QuestionContentSegment =
  | { id: string; type: "text"; text: string }
  | { id: string; type: "condition"; label?: string; text: string }
  | { id: string; type: "equation"; latex: string; display: boolean }
  | { id: string; type: "table"; rows: string[][] }
  | { id: string; type: "figure"; figureId: string };

/**
 * Import v2 keeps the source question structure intact. `question` remains a
 * compatibility projection for older readers, never the canonical v2 input.
 */
export interface StructuredQuestionSource {
  title?: string;
  page?: number;
  reference?: string;
}

export interface StructuredQuestion {
  questionNumber: string;
  section?: string;
  questionType?: string;
  points?: number;
  questionText: string;
  conditions: string[];
  equations: string[];
  choices: string[];
  contentSegments: QuestionContentSegment[];
  source?: StructuredQuestionSource;
  needsReview?: boolean;
  warning?: string;
  figureIds: string[];
}

export interface QuestionMeta {
  questionNumber: string;
  important: boolean;
  needsReview?: boolean;
  difficultyScore?: number;
  bookmarkLabel?: string;
  note?: string;
  mistakeAnalysis?: MistakeAnalysis;
  review?: ReviewState;
  /** User-owned curation ratings. Difficulty remains the existing difficultyScore field. */
  rating?: QuestionRating;
  classification?: QuestionClassification;
  updatedAt: string;
}

export interface SheetGroup {
  groupId: string;
  groupTitle: string;
  partTitle: string;
  partOrder: number;
  questionRange?: string;
}

export interface ImportAudit {
  expectedQuestionNumbers: string[];
  detectedQuestionNumbers: string[];
  missingQuestionNumbers: string[];
  uncertainQuestionNumbers: string[];
  handwritingExcluded: boolean;
  needsReviewCount: number;
}

export interface QuestionRating {
  importanceScore?: number;
  qualityScore?: number;
  userQualityScore?: number;
  aiQualityScore?: number;
  aiQualityConfidence?: number;
  lastEvaluatedAt?: string;
  evaluationSource?: "manual" | "heuristic" | "gemini";
}

export interface WrongAnswerEntry {
  id: string;
  /** 사용자가 정리한 보관 위치. sheetGroup과 독립적입니다. */
  folderId?: string;
  /** 시험 제출에서 생성된 오답의 중복 방지 provenance입니다. */
  generatedFromExamSessionId?: string;
  generatedFromQuestionNumber?: string;
  subject: string;
  title: string;
  question: string;
  questionImages: string[];
  sourcePageImages?: string[];
  problemSource?: ProblemSourceInfo;
  similarQuestionLinks?: SimilarQuestionLink[];
  /** 오답 / 문제지 / 개념 */
  entryKind: EntryKind;
  /** 어려운 문제 표시 (필터용) */
  difficult: boolean;
  /** 난이도 레벨 */
  difficulty?: Difficulty;
  /** 1~100 난이도 점수. 높을수록 어려움 */
  difficultyScore?: number;
  myAnswer: string;
  correctAnswer: string;
  /** 여러 해설 블록 (해설 1, 해설 2 …) */
  explanationParts: ExplanationPart[];
  memo: string;
  annotations: Annotation[];
  tags: string[];
  answerKey?: SheetAnswerItem[];
  figures?: SheetFigureItem[];
  questionMeta?: QuestionMeta[];
  /** Authoritative v2 question data. Older entries continue to use `question`. */
  structuredQuestions?: StructuredQuestion[];
  /** 문항 번호별 표시 순서. 기존 question 문자열 데이터와 함께 유지됩니다. */
  questionContentSegments?: Record<string, QuestionContentSegment[]>;
  sheetGroup?: SheetGroup;
  importAudit?: ImportAudit;
  rejectedNotes?: string[];
  mistakeAnalysis?: MistakeAnalysis;
  review?: ReviewState;
  reviewAttempts?: ReviewAttempt[];
  checklist?: ChecklistItem[];
  learningBlocks?: LearningBlock[];
  sourceType?: LectureSourceType;
  linkedEntryIds?: string[];
  supplementalResources?: SupplementalResource[];
  concepts?: string[];
  /** @deprecated 마이그레이션용 — explanationParts로 이전됨 */
  explanation?: string;
  /** @deprecated */
  explanationImages?: string[];
  /** @deprecated 이전 버전 호환용 */
  images?: string[];
  createdAt: string;
  updatedAt: string;
  mastered: boolean;
}

export type EntryFormData = Omit<
  WrongAnswerEntry,
  "id" | "createdAt" | "updatedAt" | "images" | "explanation" | "explanationImages"
>;

export const SUBJECTS = [
  "국어",
  "영어",
  "수학",
  "과학",
  "사회",
  "역사",
  "기타",
] as const;

export type Subject = (typeof SUBJECTS)[number];

export type SortKey =
  | "date-desc"
  | "date-asc"
  | "title-asc"
  | "title-desc"
  | "question-count-desc"
  | "bookmark-count-desc"
  | "review-need-count-desc"
  | "difficulty-score-desc"
  | "difficulty-score-asc"
  | "group-title-asc"
  | "part-order-asc";

export type ListFilter = "all" | "pending" | "mastered" | "difficult" | "due";
