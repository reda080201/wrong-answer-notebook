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

export type LibraryResourceType =
  | "past_collection"
  | "official_exam"
  | "official_mock"
  | "education_office_mock"
  | "nset"
  | "problem_set"
  | "private_mock"
  | "lecture"
  | "other";

/** Optional metadata used by the library navigator. It never replaces legacy source fields. */
export interface LearningResourceClassification {
  subject?: string;
  course?: string;
  majorUnit?: string;
  unit?: string;
  subunit?: string;
  conceptIds?: string[];
  resourceType?: LibraryResourceType;
  courseOrder?: number;
  majorUnitOrder?: number;
  unitOrder?: number;
  subunitOrder?: number;
}

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

/** Usability is independent from who verified an imported item. */
export type ProcessingStatus = "ready" | "needs_review" | "rejected";
export type VerificationSource = "none" | "gpt_self_check" | "second_pass_model" | "machine_checked" | "local_validator" | "user";

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
  processingStatus?: ProcessingStatus;
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
  processingStatus?: ProcessingStatus;
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
  /** Present only when the producer supplied a supported, trustworthy value. */
  generatedBy?: "gpt" | "deterministic_cleanup" | "deterministic_redraw";
  /** Preserves an unsupported producer label without promoting it to a trusted enum. */
  untrustedGeneratedBy?: string;
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
  verificationSource?: VerificationSource;
  verifiedAt?: string;
  verifier?: string;
}

/** A crop remains an immutable reference to the imported source-page asset. */
export interface QuestionSourceCrop {
  /** Stable per-crop identity. A question can legitimately span multiple pages. */
  id?: string;
  questionNumber: string;
  page?: number;
  order?: number;
  image: string;
  sourcePageImage?: string;
  cropRect?: NormalizedCrop;
}

/** Metadata for an explicitly retained app-rendered clean question image. */
export interface QuestionRenderVerification {
  questionNumber: string;
  canonicalFingerprint: string;
  scope?: "question" | "question_answer" | "question_answer_explanation";
  rendererVersion?: string;
  status: "unverified" | "needs_review" | "verified";
  verifiedAt?: string;
  verificationSource?: "user";
  renderedImage?: string;
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

export type StructuredQuestionType =
  | "multiple_choice"
  | "short_answer"
  | "essay"
  | "unknown";

export interface StructuredQuestionValidationIssue {
  index: number;
  questionNumber?: string;
  code: "invalid_item" | "missing_number" | "missing_text" | "duplicate_number";
  message: string;
}

export interface StructuredQuestionsRecovery {
  raw: unknown;
  issues: StructuredQuestionValidationIssue[];
}

export interface StructuredQuestion {
  questionNumber: string;
  section?: string;
  questionType?: StructuredQuestionType;
  points?: number;
  questionText: string;
  conditions: string[];
  equations: string[];
  choices: string[];
  contentSegments: QuestionContentSegment[];
  source?: StructuredQuestionSource;
  needsReview?: boolean;
  processingStatus?: ProcessingStatus;
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
  /** External material that was kept as audit evidence but excluded from canonical truth. */
  rejectedItems?: ImportRejectedItem[];
}

export interface ImportRejectedItem {
  kind: "structured_question" | "answer" | "figure";
  questionNumber?: string;
  reason: string;
  raw: unknown;
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
  questionSourceCrops?: QuestionSourceCrop[];
  questionRenderVerification?: QuestionRenderVerification[];
  problemSource?: ProblemSourceInfo;
  /** Optional library navigation metadata; legacy entries remain valid without it. */
  resourceClassification?: LearningResourceClassification;
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
  /** Malformed legacy structured data retained without making it active. */
  structuredQuestionsRecovery?: StructuredQuestionsRecovery;
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

/** Deferred deletion preserves the exact entry and its assets for a short undo window. */
export interface PendingDeletion {
  id: string;
  entry: WrongAnswerEntry;
  originalIndex: number;
  imageReferences: string[];
  requestedAt: string;
  finalizeAfter: string;
  /** Restores the focused entry after an in-app Undo. Legacy records omit it. */
  wasSelected?: boolean;
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
