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

export interface LearningBlock {
  id: string;
  type: LearningBlockType;
  title: string;
  content: string;
  sourceQuestionNumber?: string;
  diagramType?: LearningDiagramType;
  diagramSpec?: DiagramSpec;
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

export interface SheetFigureItem {
  id: string;
  questionNumber: string;
  title: string;
  caption: string;
  image?: string;
  source: "original" | "gpt_cleaned" | "described_only";
  needsReview?: boolean;
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
  lastConnectedAt?: string;
  lastError?: string;
  hasAuthToken: boolean;
}

export interface McpActiveContext {
  entryId: string | null;
  questionNumber: string | null;
}

export interface AppSettings {
  templates: EntryTemplate[];
  promptTemplates: PromptTemplate[];
  memoTemplates: MemoTemplate[];
  aiProvider: AiProviderSettings;
  importPreferences: {
    lastPromptTemplateId?: string;
  };
  answerViewPreferences: {
    viewMode: "card" | "table";
    hideAnswers: boolean;
  };
  autoBackup: {
    enabled: boolean;
    lastBackupAt?: string;
  };
  mcpBridge: McpBridgeSettings;
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

export interface WrongAnswerEntry {
  id: string;
  subject: string;
  title: string;
  question: string;
  questionImages: string[];
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
