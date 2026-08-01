export type AnnotationTool = "underline" | "highlight";

export interface TextRangeAnnotation {
  id: string;
  target: "question";
  kind: "text";
  start: number;
  end: number;
  tool: AnnotationTool;
}

export interface ImageRectAnnotation {
  id: string;
  target: "question";
  kind: "image";
  imageId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tool: AnnotationTool;
}

export type Annotation = TextRangeAnnotation | ImageRectAnnotation;

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

export type MistakeCauseType =
  | "calculation"
  | "condition_misread"
  | "concept_gap"
  | "strategy_gap"
  | "time_pressure"
  | "choice_trap"
  | "careless"
  | "unknown";

export type MistakeCauseSeverity = "low" | "medium" | "high";

export type MistakeAnalysisConfidence = "user" | "gpt" | "inferred";

export type ReviewStrategy =
  | "concept_review"
  | "drill"
  | "similar_problem"
  | "timed_retry"
  | "choice_review"
  | "solution_pattern_review";

export interface MistakeCause {
  type: MistakeCauseType;
  label?: string;
  severity: MistakeCauseSeverity;
  note?: string;
}

export interface MistakeAnalysis {
  causes: MistakeCause[];
  primaryCause?: MistakeCauseType;
  confidence?: MistakeAnalysisConfidence;
  preventionNote?: string;
  practiceMode?: ReviewStrategy;
}

export type ReviewResult = "again" | "hard" | "good";

export type ExamSessionStatus = "in_progress" | "submitted";

export interface ExamQuestionSnapshot {
  id: string;
  questionNumber: string;
  passage?: string;
  stimulusGroupId?: string;
  question: string;
  choices: string[];
  questionImages: string[];
  /** 문항 직접 연결 정보가 없는 기존 시험지 원본 페이지 이미지입니다. */
  sourcePageImages?: string[];
  figures: SheetFigureItem[];
  contentSegments?: QuestionContentSegment[];
  correctAnswer?: string;
  explanation?: string;
  generatedExamId?: string;
  sourceEntryId?: string;
  sourceQuestionNumber?: string;
  generatedQuestionPosition?: number;
}

export interface ExamResponse {
  questionNumber: string;
  response: string;
  scratchNote: string;
  markedForReview: boolean;
  updatedAt: string;
}

export interface ExamQuestionResult {
  questionNumber: string;
  correct: boolean;
  hasResponse: boolean;
  markedForReview: boolean;
}

export interface ExamSessionScore {
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  markedForReviewCount: number;
  percentCorrect: number;
  questionResults: ExamQuestionResult[];
  scoredAt: string;
}

export interface ExamSession {
  id: string;
  entryId: string;
  title: string;
  subject: string;
  status: ExamSessionStatus;
  questions: ExamQuestionSnapshot[];
  responses: ExamResponse[];
  currentQuestionIndex: number;
  startedAt: string;
  updatedAt: string;
  submittedAt?: string;
  score?: ExamSessionScore;
}

export interface ActiveExamContext {
  sessionId: string | null;
  questionId: string | null;
  questionIndex: number | null;
  userResponse: string;
  scratchNote: string;
  markedForReview: boolean;
  submitted: boolean;
  updatedAt: string;
  shareUserResponse?: boolean;
  shareScratchNote?: boolean;
  shareQuestionImages?: boolean;
  shareSourcePageImages?: boolean;
  contextUpdatedAt?: string;
}

export type ReviewPhase = "learning" | "relearning" | "long_term" | "archived";

export interface ReviewEvent {
  id: string;
  reviewedAt: string;
  result: ReviewResult;
  nextDueAt: string | null;
  intervalDays: number;
  causeSnapshot?: MistakeCauseType[];
  strategy?: ReviewStrategy;
  stabilityDays?: number;
  memoryDifficulty?: number;
  lapseCount?: number;
}

export interface ReviewState {
  dueAt: string | null;
  lastReviewedAt?: string;
  intervalDays: number;
  streak: number;
  history: ReviewEvent[];
  stabilityDays?: number;
  memoryDifficulty?: number;
  lapseCount?: number;
  preLapseStabilityDays?: number;
  relearningStep?: 0 | 1;
  repetitionCount?: number;
  phase?: ReviewPhase;
}

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface EntryTemplate {
  id: string;
  name: string;
  entryKind: EntryKind;
  data: Partial<EntryFormData>;
}

export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  builtIn?: boolean;
}

export interface MemoTemplate {
  id: string;
  name: string;
  content: string;
  builtIn?: boolean;
}

export type AiProviderType = "manual" | "gemini-flash-lite" | "gemini-3.5-flash";

export type AiProviderKeySource = "env" | "tauri-settings";

export interface AiProviderSettings {
  type: AiProviderType;
  enabled: boolean;
  keySource: AiProviderKeySource;
  hasStoredKey: boolean;
}

export interface AiProviderStatus extends AiProviderSettings {
  hasEnvKey: boolean;
  available: boolean;
  message?: string;
}

/** 로컬 읽기 전용 MCP 브리지의 공개 설정입니다. 인증 토큰은 절대 포함하지 않습니다. */
export interface McpBridgeSettings {
  enabled: boolean;
  port: number;
}

export type McpBridgeState = "stopped" | "starting" | "running" | "error";

/** 설정 화면과 앱 내부 동기화에만 쓰는 공개 상태입니다. */
export interface McpBridgeStatus {
  enabled: boolean;
  state: McpBridgeState;
  host: "127.0.0.1";
  port: number;
  readOnly: true;
  bridgeVersion: string;
  /** 마지막으로 앱이 실제 MCP 왕복 검증을 마친 시각입니다. */
  lastTestAt?: string;
  /** 마지막 실제 MCP 왕복 검증 결과입니다. 서버 listening 상태와 별개입니다. */
  lastTestOk?: boolean;
  /** 마지막으로 인증된 외부 MCP 클라이언트가 접속한 시각입니다. */
  lastClientConnectedAt?: string;
  lastError?: string;
  hasAuthToken: boolean;
}

/** 일회성 MCP 연결 코드의 공개 정보입니다. bearer token은 절대 프론트에 전달하지 않습니다. */
export interface McpBridgePairingSession {
  code: string;
  expiresAt: string;
  pairingUrl?: string;
  mcpUrl?: string;
  /** @deprecated mcpUrl을 사용하세요. */
  bridgeUrl: string;
}

export interface McpActiveContext {
  entryId: string | null;
  questionNumber: string | null;
}

export interface ViewPreferences {
  sheetLayout: "single" | "columns";
  fontSize: "normal" | "large" | "xlarge";
  hideAnswers: boolean;
  showDifficulty: boolean;
  showOriginalPages: boolean;
  showLearningVisuals: boolean;
  compactToolbar: boolean;
  lectureLayout?: LectureLayout;
}

export type LectureLayout = "document" | "cards";

export interface ExamPreferences {
  showScratchNote: boolean;
  showOriginalPages: boolean;
  showNavigator: boolean;
  autoAdvanceOnAnswer: boolean;
  warnUnansweredOnSubmit: boolean;
  showTimer: boolean;
  showMcpHelp: boolean;
}





export interface ImagePreferences {
  preserveSourcePages: boolean;
  showUnlinkedImages: boolean;
  thumbnailSize: "small" | "medium" | "large";
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

export type GeneratedExamPreset = "real_exam" | "hard" | "important" | "quality" | "weakness" | "wrong_retry" | "random" | "custom";

export interface ExamBlueprintSlot {
  position: number;
  targetDifficultyMin?: number;
  targetDifficultyMax?: number;
  answerType?: "multiple_choice" | "short_answer" | "any";
  preferredUnits?: string[];
}

export interface ExamBlueprint {
  id: string;
  name: string;
  subject?: string;
  totalQuestions: number;
  totalPoints?: number;
  timeLimitMinutes?: number;
  slots: ExamBlueprintSlot[];
}

export interface GeneratedExamQuestion {
  position: number;
  points?: number;
  source: QuestionSourceReference;
  /** @deprecated Loaded only for legacy migration. */
  sourceEntryId?: string;
  /** @deprecated Loaded only for legacy migration. */
  sourceQuestionNumber?: string;
  snapshot: ExamQuestionSnapshot;
  locked: boolean;
  selectionScore: number;
  selectionReasons: string[];
}

export type QuestionSourceStatus = "linked" | "snapshot_only" | "missing" | "unknown";

export interface QuestionSourceReference {
  sourceEntryId: string;
  sourceEntryTitle: string;
  sourceQuestionNumber: string;
  sourceSubject?: string;
  sourceExamName?: string;
  sourceExamRound?: string;
  sourceSection?: string;
  sourceTags?: string[];
  sourceSnapshotHash?: string;
  sourceStatus?: QuestionSourceStatus;
}

export interface ExamGenerationReport {
  candidateCount: number;
  selectedCount: number;
  excludedCounts: Record<string, number>;
  difficultyDistribution: Record<string, number>;
  unitDistribution: Record<string, number>;
  sourceDistribution: Record<string, number>;
  relaxedConstraints: string[];
  warnings: string[];
  usedGeminiEvaluation: boolean;
  generatedAt: string;
}

export interface GeneratedExam {
  id: string;
  title: string;
  subject: string;
  blueprintId?: string;
  preset: GeneratedExamPreset;
  createdAt: string;
  updatedAt: string;
  seed: string;
  status: "draft" | "ready" | "archived";
  timeLimitMinutes?: number;
  totalPoints?: number;
  questions: GeneratedExamQuestion[];
  generationReport: ExamGenerationReport;
}

export interface GptMcpPreferences {
  mcpShareScope: "current-question" | "session-summary" | "submitted-result";
  importReviewExpanded: boolean;
  importDetailCollapsedByDefault: boolean;
}

/** ChatGPT preferences for read-only local MCP bridge. */
export interface ChatGptMcpPreferences {
  displayName: string;
  remoteBaseUrl?: string;
  shareUserResponse: boolean;
  shareScratchNote: boolean;
  shareQuestionImages: boolean;
  shareSourcePageImages: boolean;
  copyPromptBeforeOpen: boolean;
  openChatGptAfterCopy: boolean;
}

/** Retake exam sheet PDF preset */
export type ExamPrintPreset =
  | "real_exam"
  | "spacious"
  | "wrong_only"
  | "source_like"
  | "custom";

/** Share/export question scope */
export type ExportScopeMode =
  | "current"
  | "selected"
  | "wrong"
  | "important"
  | "marked"
  | "whole"
  | "manual";

/** Exam print/PDF preferences */
export interface ExamPrintPreferences {
  preset: ExamPrintPreset;
  paperSize: "a4" | "letter";
  orientation: "portrait" | "landscape" | "auto";
  layout: "single" | "columns" | "auto";
  includeHeader: boolean;
  includeAnswerSheet: boolean;
  includePageNumbers: boolean;
  includeSourcePages: boolean;
  workspaceSize: "none" | "small" | "normal" | "large";
  extraScratchPages: number;
  sourceDisplay?: "hidden" | "below-question" | "index-at-end";
  includeSourceIndex?: boolean;
}

/** App-owned export context read by MCP */
export interface McpExportContext {
  entryId: string | null;
  sessionId?: string | null;
  scope: ExportScopeMode;
  questionNumbers: string[];
  submitted: boolean;
  shareOptions: Pick<
    ChatGptMcpPreferences,
    "shareUserResponse" | "shareScratchNote" | "shareQuestionImages" | "shareSourcePageImages"
  >;
  updatedAt: string;
  generatedExamId?: string | null;
  includeSourceReferences?: boolean;
}

export interface AppSettings {
  templates: EntryTemplate[];
  promptTemplates: PromptTemplate[];
  memoTemplates: MemoTemplate[];
  aiProvider: AiProviderSettings;
  importPreferences: {
    lastPromptTemplateId?: string;
  };
  viewPreferences: ViewPreferences;
  examPreferences: ExamPreferences;
  examPrintPreferences: ExamPrintPreferences;
  imagePreferences: ImagePreferences;
  gptMcpPreferences: GptMcpPreferences;
  chatGptMcpPreferences: ChatGptMcpPreferences;
  answerViewPreferences: {
    viewMode: "card" | "table";
    hideAnswers: boolean;
  };
  autoBackup: {
    enabled: boolean;
    lastBackupAt?: string;
  };
  mcpBridge: McpBridgeSettings;
  updatePreferences: AppUpdatePreferences;
  questionBankPreferences?: QuestionBankPreferences;
}

export type QuestionBankSort = "updated" | "difficulty" | "importance" | "quality" | "review_due";

export interface QuestionBankStoredFilters {
  subject?: string;
  sourceType?: ProblemSourceType | "all";
  unit?: string;
  subunit?: string;
  concept?: string;
  minDifficulty?: number | null;
  minImportance?: number | null;
  minQuality?: number | null;
  answerType?: QuestionAnswerType | "all";
  wrongOnly?: boolean;
  answerState?: "all" | "has" | "missing";
  explanationState?: "all" | "has" | "missing";
  hasImages?: "all" | "has" | "missing";
  reviewDueOnly?: boolean;
  year?: string;
  tag?: string;
}

export interface QuestionBankPreset {
  id: string;
  name: string;
  filters: QuestionBankStoredFilters;
  sort: QuestionBankSort;
}

export interface QuestionBankPreferences {
  recentFilters?: QuestionBankStoredFilters;
  savedPresets?: QuestionBankPreset[];
  lastSort?: QuestionBankSort;
}

export interface AppUpdatePreferences {
  autoCheckEnabled: boolean;
  notificationsEnabled: boolean;
  backupBeforeInstall: boolean;
  channel: "stable";
  skippedVersion?: string;
  lastCheckedAt?: string;
  lastSeenReleaseNotesVersion?: string;
}

export type IntegritySeverity = "info" | "warning" | "error";

export interface IntegrityIssue {
  id: string;
  severity: IntegritySeverity;
  message: string;
  entryId?: string;
}

export interface IntegrityReport {
  checkedAt: string;
  issues: IntegrityIssue[];
}

export interface OrphanImagePreview {
  filenames: string[];
  totalBytes: number;
}

export interface WrongAnswerEntry {
  id: string;
  subject: string;
  title: string;
  question: string;
  questionImages: string[];
  sourcePageImages?: string[];
  problemSource?: ProblemSourceInfo;
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

export interface ReviewAttempt {
  id: string;
  entryId: string;
  questionNumber?: string;
  reviewedAt: string;
  answerText?: string;
  correct: boolean;
  durationSeconds?: number;
  confidence?: "low" | "medium" | "high";
  hintUsed?: boolean;
  blockedStage?: "concept" | "interpretation" | "strategy" | "calculation" | "verification";
  mistakeCause?: MistakeCauseType;
  result: ReviewResult;
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

export type ThemeMode = "light" | "dark" | "system";

export type ListFilter = "all" | "pending" | "mastered" | "difficult" | "due";

export type ReviewItem =
  | { kind: "entry"; entry: WrongAnswerEntry }
  | { kind: "sheet-question"; entry: WrongAnswerEntry; questionNumber: string };
