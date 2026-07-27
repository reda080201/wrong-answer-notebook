import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { v4 as uuidv4 } from "uuid";
import type {
  AiProviderSettings,
  AiProviderStatus,
  AiProviderType,
  AppSettings,
  IntegrityReport,
  McpActiveContext,
  ActiveExamContext,
  AppUpdatePreferences,
  OrphanImagePreview,
  EntryFormData,
  McpExportContext,
  ExamSession,
  McpBridgeSettings,
  McpBridgeStatus,
  McpBridgePairingSession,
  MemoTemplate,
  PromptTemplate,
  WrongAnswerEntry,
} from "./types";
import type { GeneratedExam } from "./types";
import type { ImportAssetSessionManifest } from "./features/import-workspace/model/importWorkspace";
import { loadGeneratedExams as loadGeneratedExamsFromStorage, saveGeneratedExams as saveGeneratedExamsToStorage } from "./features/exam-builder/storage/generatedExamStorage";
import { IMPORT_LIMITS } from "./features/import/services/importLimits";
import {
  loadExamSessions as loadExamSessionsFromStorage,
  saveExamSessions as saveExamSessionsToStorage,
} from "./features/exam/storage/examSessionStorage";
import { getAllImageFilenames, normalizeEntry } from "./utils/entry";
import { mapEntryImportImageReferences } from "./utils/importImageReferences";
import { normalizeImportImageKey } from "./utils/importImageReferences";
import {
  DEFAULT_EXAM_PREFERENCES,
  DEFAULT_CHATGPT_MCP_PREFERENCES,
  DEFAULT_EXAM_PRINT_PREFERENCES,
  DEFAULT_GPT_MCP_PREFERENCES,
  DEFAULT_IMAGE_PREFERENCES,
  DEFAULT_VIEW_PREFERENCES,
  normalizeExamPreferences,
  normalizeChatGptMcpPreferences,
  normalizeExamPrintPreferences,
  normalizeGptMcpPreferences,
  normalizeImagePreferences,
  resolveViewPreferences,
} from "./utils/viewPreferences";

const imageUrlCache = new Map<string, string>();
const ENTRIES_STORAGE_KEY = "wrong-answer-entries";
const SETTINGS_STORAGE_KEY = "wrong-answer-settings";
/** Per-file cap for browser/Tauri image import (aligned with `IMPORT_LIMITS.MAX_IMAGE_BYTES`). */
export const MAX_IMPORT_IMAGE_BYTES = IMPORT_LIMITS.MAX_IMAGE_BYTES;
const ENTRIES_SCHEMA_VERSION = 2;

interface StoredEntriesDocument {
  schemaVersion: number;
  entries: unknown[];
}

function parseStoredEntries(raw: string): WrongAnswerEntry[] {
  const parsed = JSON.parse(raw) as unknown;
  const entries = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && "entries" in parsed && Array.isArray(parsed.entries)
      ? (parsed as StoredEntriesDocument).entries
      : null;
  if (!entries) throw new Error("저장 데이터 형식이 올바르지 않습니다.");
  return entries.map((entry) => normalizeEntry(entry as WrongAnswerEntry));
}

export const DEFAULT_SETTINGS: AppSettings = {
  templates: [],
  promptTemplates: [],
  memoTemplates: [],
  aiProvider: {
    type: "manual",
    enabled: false,
    keySource: "env",
    hasStoredKey: false,
  },
  importPreferences: {},
  viewPreferences: DEFAULT_VIEW_PREFERENCES,
  examPreferences: DEFAULT_EXAM_PREFERENCES,
  examPrintPreferences: DEFAULT_EXAM_PRINT_PREFERENCES,
  imagePreferences: DEFAULT_IMAGE_PREFERENCES,
  gptMcpPreferences: DEFAULT_GPT_MCP_PREFERENCES,
  chatGptMcpPreferences: DEFAULT_CHATGPT_MCP_PREFERENCES,
  answerViewPreferences: {
    viewMode: "card",
    hideAnswers: false,
  },
  autoBackup: {
    enabled: false,
  },
  mcpBridge: {
    enabled: false,
    port: 43129,
  },
  updatePreferences: {
    autoCheckEnabled: true,
    notificationsEnabled: true,
    backupBeforeInstall: true,
    channel: "stable",
  },
};

/** @deprecated Use DEFAULT_SETTINGS */
export const defaultSettings = DEFAULT_SETTINGS;

export const builtInPromptTemplates: PromptTemplate[] = [
  {
    id: "builtin-sheet-png-package",
    name: "시험지+답안지+PNG 패키지",
    builtIn: true,
    content: `사진 속 문제지와 답안지를 분석해 wrong-answer-notebook-import-v2 형식의 import.json과 실제 PNG/JPG/WebP 자산으로 구성된 패키지를 만들어줘.

표준 출력은 반드시 다음 wrapper 구조를 따른다.
{
  "schemaVersion": "wrong-answer-notebook-import-v2",
  "importType": "problem_sheet",
  "title": "자료 제목",
  "subject": "수학",
  "entries": [{
    "entryKind": "problem_sheet",
    "title": "시험지 제목",
    "subject": "수학",
    "question": "...",
    "answerKey": [],
    "figures": [],
    "learningBlocks": [],
    "rejectedNotes": [],
    "audit": {}
  }]
}

entryKind 규칙: 시험지는 반드시 problem_sheet, 개별 오답은 wrong_answer, 개념노트는 concept, 특강은 lecture다. entries의 모든 항목에 entryKind를 반드시 넣고 importType과 일치시킨다. 여러 종류가 섞이면 importType은 mixed다. import.json의 이미지 파일명은 ZIP 내부 파일명과 대소문자까지 정확히 일치시킨다.

이 모드는 실제 이미지 생성이 가능한 PNG 패키지 모드다. JSON 설명만 작성하지 말고 원본 도형 crop을 입력으로 사용해 cleaned PNG를 생성해라.

도형 처리 순서:
1. 원본 페이지 이미지와 도형별 원본 crop을 보존한다.
2. 각 crop을 image-to-image로 정리해 cleaned PNG를 생성한다. 새 도형으로 재해석하지 말고 구도, 종횡비, 점과 라벨, 선분·곡선·원·축, 수치, 실선·점선, 열린점·닫힌점, 직각·평행·같은 길이 표시, 음영을 유지하고 손글씨와 촬영 노이즈만 제거한다.
3. 원본을 독립적으로 다시 분석해 semanticSpec을 만든다. 모르는 관계는 추측하지 말고 confidence와 warnings를 남긴다.
4. 원본 crop, cleaned PNG, semanticSpec, 문제 본문, 선택지를 독립 재검증해 verification을 작성한다. 생성 단계의 설명을 검증 결과로 복사하지 마라.
5. confidence >= 0.95이고 blockingIssues가 없으면 preferredRepresentation="cleaned", image는 cleaned 파일명, source="gpt_cleaned", needsReview=false로 설정한다. 그렇지 않으면 preferredRepresentation="original", image는 original crop 파일명, source="original", needsReview=true로 설정한다.

필수 규칙:
 - import.json은 순수 JSON 객체 하나만 출력하고 base64 이미지, data URL, raw HTML/SVG, script, iframe은 넣지 마라.
 - figures[] 배열의 각 항목에 original, cleaned, semanticSpec, verification, preferredRepresentation을 별도 필드로 보존한다. 기존 image/source/needsReview도 반드시 함께 넣어 하위 호환한다.
 - 파일명은 실제 ZIP 파일명과 대소문자까지 일치시킨다. 예: graph_1.png. original.image와 cleaned.image가 있으면 둘 다 ZIP에 포함한다.
- 문제 번호가 불확실하거나 검증이 실패하면 questionNumber를 비우고 needsReview=true로 표시한다.
- 손글씨와 학생 풀이 흔적은 문제·답안에 넣지 말고 rejectedNotes에 기록한다.
- audit에는 예상/감지/누락/불확실 번호와 needsReviewCount를 기록한다.
- semanticSpec은 function_graph, coordinate_geometry, plane_geometry, solid_geometry, probability_tree, table, venn_diagram, number_line, sequence_diagram, custom_math_diagram 중 하나를 사용한다.
- answerKey와 learningBlocks의 diagramSpec은 실제 학습에 필요한 경우에만 만든다.

figure 예시:
{
  "id": "figure-1",
  "questionNumber": "1",
  "title": "1번 그래프",
  "caption": "축, 점, 교점과 음영 영역 설명",
  "original": { "image": "q01_figure_original.png", "sourcePageImage": "source_page_001.png", "crop": { "x": 0.1, "y": 0.2, "width": 0.4, "height": 0.3 } },
  "cleaned": { "image": "q01_figure_cleaned.png", "generatedBy": "gpt", "generatedAt": "2026-01-01T00:00:00Z", "sourceImageHash": "sha256:...", "promptVersion": "figure-clean-v1" },
  "semanticSpec": { "type": "function_graph", "points": [], "segments": [], "relations": [], "warnings": [], "confidence": 0.98 },
  "verification": { "status": "verified", "confidence": 0.97, "checks": { "topologyMatch": true, "numericLabelsMatch": true, "visualLayoutPreserved": true }, "blockingIssues": [], "warnings": [], "verifier": "independent-figure-check-v1" },
  "preferredRepresentation": "cleaned",
  "image": "q01_figure_cleaned.png",
  "source": "gpt_cleaned",
  "needsReview": false
}

문제 본문·answerKey·audit·rejectedNotes·learningBlocks도 기존 import 스키마에 맞춰 함께 작성해라. tags와 최상위 difficulty는 만들지 마라.`,
  },
  {
    id: "builtin-sheet-answer-json",
    name: "시험지+답안지 JSON",
    builtIn: true,
    content: `사진 속 문제지와 답안지를 오답노트 앱에 넣을 JSON으로 정리해줘. 이 모드는 JSON 전용이며 이미지를 생성하거나 파일을 첨부하지 않는다.

규칙:
- 최상위 단일 시험지 객체에는 반드시 "entryKind": "problem_sheet"를 넣어줘.
- 반드시 순수 JSON 객체 1개만 출력해줘. 첫 글자는 {, 마지막 글자는 } 이어야 해.
- PNG를 생성하지 말고, 원본 도형의 상세 구조·관계·수치·라벨을 semanticSpec과 caption에 기록해.
- figures[].original에는 필요한 원본 crop과 source page의 파일명 계획만 적고 실제 이미지가 없으면 image를 만들지 마.
- figures[].cleaned에는 생성 예정 파일명, promptVersion, sourceImageHash 계획만 기록할 수 있으며 generatedBy는 gpt로 적지 마. 실제 정리 PNG는 PNG 패키지 모드에서만 만든다.
- 이미지가 제공되지 않았으므로 verification.status는 기본적으로 needs_review, preferredRepresentation은 original, needsReview는 true로 둔다.
- 기존 image/source/needsReview 필드는 유지하되 실제 파일이 없으면 image는 생략하고 source는 described_only로 둔다.
- 설명문, Markdown, 코드블록, \`\`\`json, 파일 첨부 안내 문구는 절대 넣지 마.
- 문제 원문은 question에 줄바꿈을 살려 넣어줘.
- 도표/그래프/표는 빠뜨리지 말고 Markdown 표, 축·범례·값 설명, 또는 [도표/그래프 설명] 블록으로 옮겨줘.
- 손글씨, 밑줄, 별표, 동그라미, 여백 메모, 학생 풀이 흔적은 question, memo, importantNotes, answerKey 어디에도 넣지 말고 rejectedNotes에만 기록해줘.
- audit에는 이미지에서 예상되는 문제 번호, 실제 감지 번호, 누락 번호, 불확실 번호, 손글씨 제외 여부, 검토 필요 개수를 반드시 기록해줘.
- 답안지에 인쇄된 정답·해설·정답 근거는 유지하되, 시험지 위 학생 필기와 구분해줘.
- 시험지 전체에 해당하는 학습 포인트만 importantNotes에 넣어줘.
- 특정 문제에만 해당하는 메모는 importantNotes나 memo에 넣지 말고 반드시 answerKey[].notes에 넣어줘.
- 답안지는 answerKey 배열로 문제 번호, 정답, 풀이, 문제별 메모, 중요 포인트, 개념을 연결해줘.
- 해설에서 특강 카드로 쓸 수 있는 answerKey[].strategy, steps, wrongPoint, reviewPoint, concepts를 가능한 한 구체적으로 채워줘.
- 시각화가 실제 이해에 도움이 되는 경우에만 answerKey[].diagramSpec 또는 learningBlocks[].diagramSpec을 넣어줘. 단순 계산 문제에는 만들지 말고, 한 문항당 최대 1개, 전체 learningBlocks diagram은 최대 3개까지만 허용해.
- raw HTML, raw SVG, base64 이미지, script, iframe 문자열은 절대 넣지 마.
- 왜 틀리기 쉬운지 판단 가능한 경우 mistakeAnalysis.causes에 오답 원인을 넣어줘. 허용 type은 calculation, condition_misread, concept_gap, strategy_gap, time_pressure, choice_trap, careless, unknown 이야.
- 오답 원인은 추측이 약하면 unknown만 쓰거나 causes를 비워둬.
- 난이도는 answerKey[].difficulty에만 넣고, 확실히 판단 가능한 문항에만 "low", "medium", "high" 중 하나로 넣어줘.
- 근거가 부족하면 difficulty 필드를 생략해줘. 모든 문항에 같은 difficulty를 반복해서 채우지 마.
- 답안 번호가 불확실하면 questionNumber를 추측하지 말고 빈 문자열로 두고 needsReview를 true로 표시해줘.
- 모르는 값은 추측하지 말고 빈 문자열이나 빈 배열로 둬.
- tags 필드는 만들지 마.
- 최상위 difficulty 필드는 만들지 마.

형식:
{
  "entryKind": "problem_sheet",
  "title": "시험지 제목",
  "subject": "수학",
  "question": "1. ...\\n① ...",
  "importantNotes": ["전체적으로 알아둘 점"],
  "memo": "추가 메모",
  "rejectedNotes": ["학생 필기로 의심되어 제외한 내용"],
  "audit": {
    "expectedQuestionNumbers": ["1"],
    "detectedQuestionNumbers": ["1"],
    "missingQuestionNumbers": [],
    "uncertainQuestionNumbers": [],
    "handwritingExcluded": true,
    "needsReviewCount": 0
  },
  "mistakeAnalysis": {
    "causes": [
      { "type": "concept_gap", "severity": "medium", "note": "핵심 개념 확인 필요" }
    ],
    "primaryCause": "concept_gap",
    "confidence": "gpt",
    "preventionNote": "풀이 전 조건과 개념을 먼저 적기",
    "practiceMode": "concept_review"
  },
  "answerKey": [
    {
      "questionNumber": "1",
      "answer": "③",
      "explanation": "풀이",
      "strategy": "조건을 식으로 바꾸고 그래프를 확인",
      "steps": ["조건 정리", "식 세우기", "정답 검산"],
      "wrongPoint": "교점과 절편을 혼동하기 쉬움",
      "reviewPoint": "다음 복습 때 그래프 표시부터 확인",
      "notes": "이 문항에서만 다시 볼 메모",
      "importantPoints": ["주의할 점"],
      "concepts": ["함수"],
      "needsReview": false,
      "sourceNote": "답안지 1번과 연결"
    }
  ],
  "concepts": ["함수", "그래프"],
  "learningBlocks": []
}`,
  },
  {
    id: "builtin-important-notes",
    name: "중요 포인트 중심",
    builtIn: true,
    content: "문제지와 답안지의 인쇄된 내용만 기준으로, 시험지 전체 핵심은 importantNotes에, 특정 문항 메모는 answerKey[].notes에, 문항별 풀이 포인트는 answerKey[].importantPoints에 정리해줘. 판단 가능한 오답 원인은 mistakeAnalysis.causes에 calculation/condition_misread/concept_gap/strategy_gap/time_pressure/choice_trap/careless/unknown 중에서 넣어줘. 손글씨, 밑줄, 별표, 여백 메모, 학생 풀이 흔적은 모두 제외해줘. tags 필드와 최상위 difficulty 필드는 만들지 말고, 첫 글자가 {이고 마지막 글자가 }인 순수 JSON만 출력해줘.",
  },
  {
    id: "builtin-concept-links",
    name: "개념 링크 강화",
    builtIn: true,
    content: "인쇄된 문제와 답안지 해설에 등장하는 핵심 개념을 concepts 배열에 정리하고, question이나 memo 안에서 자연스럽게 연결할 수 있는 개념명은 [[개념명]] 형태로 표시해줘. 손글씨/밑줄/별표/여백 메모는 제외하고, 도표/그래프는 Markdown 표나 [도표/그래프 설명]으로 보존해줘. tags 필드 없이 순수 JSON 객체 1개만 출력해줘.",
  },
  {
    id: "builtin-concept-knowledge-json",
    name: "개념자료 앱 호환 JSON",
    builtIn: true,
    content: `개념 정리 자료를 오답노트 앱에 바로 가져올 수 있는 순수 JSON 객체 1개로 만들어줘.

우선 아래 둘 중 하나로 출력해줘.

1. 개념노트 여러 개:
{
  "entries": [
    {
      "entryKind": "concept",
      "title": "개념명",
      "subject": "사회",
      "question": "한 문단 정의",
      "memo": "단원, 시험 포인트, 오답 함정",
      "tags": ["사회", "단원명", "개념명"],
      "concepts": ["개념명"],
      "learningBlocks": [
        { "type": "concept", "title": "개념명", "content": "정의" },
        { "type": "checklist", "title": "시험 포인트", "content": "- 포인트" },
        { "type": "warning", "title": "오답 함정", "content": "- 함정" }
      ]
    }
  ]
}

2. 하나의 특강자료:
{
  "entryKind": "lecture",
  "title": "자료명",
  "subject": "사회",
  "sourceType": "json",
  "learningBlocks": [
    { "type": "concept", "title": "핵심 개념", "content": "설명" },
    { "type": "routine", "title": "판단 기준", "content": "- 키워드\\n- 시험 판단" }
  ]
}

nested units 구조가 꼭 필요하면 다음 필드를 반드시 넣어줘.
{
  "schemaVersion": "concept-knowledge-v1",
  "sourceType": "concept_knowledge_base",
  "units": [],
  "thinkerMatrix": [],
  "examSolvingRules": [],
  "minimalKeywordMap": {}
}

규칙:
- raw HTML, raw SVG, script, iframe, base64는 절대 넣지 마.
- learningBlocks type은 concept, formula, routine, warning, review, checklist, diagram 중 하나만 써줘.
- 사상가 비교표는 thinkerMatrix 대신 가능하면 learningBlocks의 routine 카드로 정리해줘.
- 설명문, Markdown, 코드블록 없이 첫 글자가 {이고 마지막 글자가 }인 JSON만 출력해줘.`,
  },
];

export const builtInMemoTemplates: MemoTemplate[] = [
  {
    id: "builtin-review-memo",
    name: "복습 메모",
    builtIn: true,
    content: "핵심 개념\n- \n\n실수 원인\n- \n\n다시 볼 포인트\n- \n\n다음 복습\n- ",
  },
  {
    id: "builtin-answer-analysis",
    name: "답안 분석",
    builtIn: true,
    content: "정답 근거\n- \n\n헷갈린 보기\n- \n\n암기/공식\n- ",
  },
];

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return `${fallback} (${error.message})`;
  }
  if (typeof error === "string" && error.trim()) {
    return `${fallback} (${error})`;
  }
  return fallback;
}

export async function loadEntries(): Promise<WrongAnswerEntry[]> {
  try {
    let data: WrongAnswerEntry[];
    if (isTauri()) {
      data = await invoke<WrongAnswerEntry[]>("load_entries");
    } else {
      const raw = localStorage.getItem(ENTRIES_STORAGE_KEY);
      data = raw ? parseStoredEntries(raw) : [];
    }
    return data.map(normalizeEntry);
  } catch (error) {
    throw new Error(errorMessage(error, "저장된 노트를 불러오지 못했습니다."), {
      cause: error,
    });
  }
}

export async function saveEntries(entries: WrongAnswerEntry[]): Promise<void> {
  try {
    if (isTauri()) {
      await invoke("save_entries", { entries });
      return;
    }
    const document: StoredEntriesDocument = {
      schemaVersion: ENTRIES_SCHEMA_VERSION,
      entries,
    };
    localStorage.setItem(ENTRIES_STORAGE_KEY, JSON.stringify(document));
  } catch (error) {
    throw new Error(errorMessage(error, "노트를 저장하지 못했습니다."), {
      cause: error,
    });
  }
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    if (isTauri()) {
      const data = await invoke<AppSettings>("load_settings");
      return normalizeSettings(data);
    }
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : DEFAULT_SETTINGS);
  } catch (error) {
    throw new Error(errorMessage(error, "설정을 불러오지 못했습니다."), {
      cause: error,
    });
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    const normalized = normalizeSettings(settings);
    if (isTauri()) {
      await invoke("save_settings", { settings: normalized });
      return;
    }
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    throw new Error(errorMessage(error, "설정을 저장하지 못했습니다."), {
      cause: error,
    });
  }
}

function mergeBuiltInPromptTemplates(templates: PromptTemplate[]): PromptTemplate[] {
  const userTemplates = templates.filter((template) => !template.builtIn);
  return [
    ...builtInPromptTemplates,
    ...userTemplates.filter(
      (template) => !builtInPromptTemplates.some((builtIn) => builtIn.id === template.id),
    ),
  ];
}

function mergeBuiltInMemoTemplates(templates: MemoTemplate[]): MemoTemplate[] {
  const userTemplates = templates.filter((template) => !template.builtIn);
  return [
    ...builtInMemoTemplates,
    ...userTemplates.filter(
      (template) => !builtInMemoTemplates.some((builtIn) => builtIn.id === template.id),
    ),
  ];
}

function normalizePromptTemplates(raw: unknown): PromptTemplate[] {
  const templates = Array.isArray(raw)
    ? raw
        .filter((template): template is Partial<PromptTemplate> =>
          Boolean(template && typeof template === "object"),
        )
        .map((template) => ({
          id: `${template.id ?? uuidv4()}`,
          name: `${template.name ?? ""}`.trim(),
          content: `${template.content ?? ""}`.trim(),
          builtIn: Boolean(template.builtIn),
        }))
        .filter((template) => template.name && template.content)
    : [];
  return mergeBuiltInPromptTemplates(templates);
}

function normalizeMemoTemplates(raw: unknown): MemoTemplate[] {
  const templates = Array.isArray(raw)
    ? raw
        .filter((template): template is Partial<MemoTemplate> =>
          Boolean(template && typeof template === "object"),
        )
        .map((template) => ({
          id: `${template.id ?? uuidv4()}`,
          name: `${template.name ?? ""}`.trim(),
          content: `${template.content ?? ""}`,
          builtIn: Boolean(template.builtIn),
        }))
        .filter((template) => template.name && template.content.trim())
    : [];
  return mergeBuiltInMemoTemplates(templates);
}

function normalizeAiProvider(raw: unknown): AiProviderSettings {
  if (!isTauri()) {
    return {
      type: "manual",
      enabled: false,
      keySource: "env",
      hasStoredKey: false,
    };
  }
  const value = raw && typeof raw === "object" ? raw as Partial<AiProviderSettings> : {};
  const type: AiProviderType =
    value.type === "gemini-flash-lite" || value.type === "gemini-3.5-flash"
      ? value.type
      : "manual";
  return {
    type,
    enabled: type !== "manual" && Boolean(value.enabled),
    keySource: value.keySource === "tauri-settings" ? "tauri-settings" : "env",
    hasStoredKey: Boolean(value.hasStoredKey),
  };
}

export function normalizeSettings(raw: AppSettings): AppSettings {
  const legacyStorage = typeof localStorage !== "undefined" ? localStorage : undefined;
  const viewPreferences = resolveViewPreferences(raw?.viewPreferences, {
    answerViewPreferences: raw?.answerViewPreferences,
    storage: legacyStorage,
  });

  return {
    templates: Array.isArray(raw?.templates)
      ? raw.templates
          .filter((template) => template && template.id && template.name)
          .map((template) => ({
            ...template,
            data: template.data ?? {},
          }))
      : [],
    promptTemplates: normalizePromptTemplates(raw?.promptTemplates),
    memoTemplates: normalizeMemoTemplates(raw?.memoTemplates),
    aiProvider: normalizeAiProvider(raw?.aiProvider),
    importPreferences: {
      lastPromptTemplateId:
        typeof raw?.importPreferences?.lastPromptTemplateId === "string"
          ? raw.importPreferences.lastPromptTemplateId
          : undefined,
    },
    viewPreferences,
    examPreferences: normalizeExamPreferences(raw?.examPreferences),
    examPrintPreferences: normalizeExamPrintPreferences(raw?.examPrintPreferences),
    imagePreferences: normalizeImagePreferences(raw?.imagePreferences),
    gptMcpPreferences: normalizeGptMcpPreferences(raw?.gptMcpPreferences),
    chatGptMcpPreferences: normalizeChatGptMcpPreferences(raw?.chatGptMcpPreferences),
    answerViewPreferences: {
      viewMode: raw?.answerViewPreferences?.viewMode === "table" ? "table" : "card",
      hideAnswers: viewPreferences.hideAnswers,
    },
    autoBackup: {
      enabled: Boolean(raw?.autoBackup?.enabled),
      lastBackupAt: raw?.autoBackup?.lastBackupAt,
    },
    mcpBridge: normalizeMcpBridgeSettings(raw?.mcpBridge),
    updatePreferences: normalizeUpdatePreferences(raw?.updatePreferences),
  };
}

function normalizeUpdatePreferences(raw: unknown): AppUpdatePreferences {
  const value = raw && typeof raw === "object" ? raw as Partial<AppUpdatePreferences> : {};
  return {
    autoCheckEnabled: value.autoCheckEnabled !== false,
    notificationsEnabled: value.notificationsEnabled !== false,
    backupBeforeInstall: value.backupBeforeInstall !== false,
    channel: "stable",
    skippedVersion: typeof value.skippedVersion === "string" ? value.skippedVersion : undefined,
    lastCheckedAt: typeof value.lastCheckedAt === "string" ? value.lastCheckedAt : undefined,
    lastSeenReleaseNotesVersion: typeof value.lastSeenReleaseNotesVersion === "string" ? value.lastSeenReleaseNotesVersion : undefined,
  };
}

function normalizeMcpBridgeSettings(raw: unknown): McpBridgeSettings {
  const value = raw && typeof raw === "object" ? raw as Partial<McpBridgeSettings> : {};
  const requestedPort = Number(value.port);
  const port = Number.isInteger(requestedPort) && requestedPort >= 1024 && requestedPort <= 65535
    ? requestedPort
    : 43129;
  return {
    // The browser preview never exposes a local bridge.
    enabled: isTauri() && Boolean(value.enabled),
    port,
  };
}

const browserMcpBridgeStatus: McpBridgeStatus = {
  enabled: false,
  state: "stopped",
  host: "127.0.0.1",
  port: 43129,
  readOnly: true,
  bridgeVersion: "local-bridge-v1",
  hasAuthToken: false,
  lastError: "브라우저 모드에서는 로컬 MCP 브리지를 사용할 수 없습니다.",
};

export async function getMcpBridgeStatus(): Promise<McpBridgeStatus> {
  if (!isTauri()) return browserMcpBridgeStatus;
  try {
    return await invoke<McpBridgeStatus>("get_mcp_bridge_status");
  } catch (error) {
    return {
      ...browserMcpBridgeStatus,
      lastError: errorMessage(error, "MCP 브리지 상태를 확인하지 못했습니다."),
    };
  }
}

export async function setMcpBridgeEnabled(enabled: boolean, port = 43129): Promise<McpBridgeStatus> {
  if (!isTauri()) return browserMcpBridgeStatus;
  return invoke<McpBridgeStatus>("set_mcp_bridge_enabled", { enabled, port });
}

export async function testMcpBridgeConnection(): Promise<McpBridgeStatus> {
  if (!isTauri()) return browserMcpBridgeStatus;
  return invoke<McpBridgeStatus>("test_mcp_bridge");
}

/** Rust command returns a short-lived pairing code only, never the bridge bearer token. */
export async function createMcpBridgePairing(): Promise<McpBridgePairingSession> {
  if (!isTauri()) throw new Error("브라우저 모드에서는 MCP 페어링을 사용할 수 없습니다.");
  const session = await invoke<Omit<McpBridgePairingSession, "bridgeUrl"> & { bridgeUrl?: string }>("create_mcp_bridge_pairing");
  return { ...session, mcpUrl: session.mcpUrl ?? session.bridgeUrl, bridgeUrl: session.bridgeUrl ?? session.mcpUrl ?? "" };
}

/** Invalidates the current bridge credential without exposing its value to the UI. */
export async function rotateMcpBridgeCredential(): Promise<McpBridgeStatus> {
  if (!isTauri()) return browserMcpBridgeStatus;
  return invoke<McpBridgeStatus>("rotate_mcp_bridge_credential");
}

/** Closes authenticated clients and invalidates their server-side session. */
export async function disconnectMcpBridgeClients(): Promise<McpBridgeStatus> {
  if (!isTauri()) return browserMcpBridgeStatus;
  return invoke<McpBridgeStatus>("disconnect_mcp_bridge_clients");
}

export async function syncMcpBridgeActiveContext(context: McpActiveContext): Promise<void> {
  if (!isTauri()) return;
  await invoke("sync_active_context", {
    entryId: context.entryId,
    questionNumber: context.questionNumber,
  });
}

export async function syncMcpBridgeActiveExamContext(context: ActiveExamContext): Promise<void> {
  if (!isTauri()) return;
  await invoke("sync_active_exam_context", { context });
}

export async function syncMcpBridgeExportContext(context: McpExportContext): Promise<void> {
  if (!isTauri()) return;
  await invoke("sync_active_export_context", { context });
}

export async function loadExamSessions(): Promise<ExamSession[]> {
  try {
    if (isTauri()) {
      return await invoke<ExamSession[]>("load_exam_sessions");
    }
    return loadExamSessionsFromStorage();
  } catch (error) {
    throw new Error(errorMessage(error, "모의고사 세션을 불러오지 못했습니다."), {
      cause: error,
    });
  }
}

export async function saveExamSessions(sessions: ExamSession[]): Promise<void> {
  try {
    if (isTauri()) {
      await invoke("save_exam_sessions", { sessions });
      return;
    }
    saveExamSessionsToStorage(sessions);
  } catch (error) {
    throw new Error(errorMessage(error, "모의고사 세션을 저장하지 못했습니다."), {
      cause: error,
    });
  }
}

export async function loadGeneratedExams(): Promise<GeneratedExam[]> {
  try {
    if (isTauri()) return await invoke<GeneratedExam[]>("load_generated_exams");
    return loadGeneratedExamsFromStorage();
  } catch (error) {
    throw new Error(errorMessage(error, "생성 모의고사를 불러오지 못했습니다."), { cause: error });
  }
}

export async function saveGeneratedExams(exams: GeneratedExam[]): Promise<void> {
  try {
    if (isTauri()) { await invoke("save_generated_exams", { exams }); return; }
    saveGeneratedExamsToStorage(exams);
  } catch (error) {
    throw new Error(errorMessage(error, "생성 모의고사를 저장하지 못했습니다."), { cause: error });
  }
}

export async function getAiProviderStatus(): Promise<AiProviderStatus> {
  if (!isTauri()) {
    return {
      type: "manual",
      enabled: false,
      keySource: "env",
      hasStoredKey: false,
      hasEnvKey: false,
      available: false,
      message: "브라우저 모드는 manual provider만 지원합니다.",
    };
  }
  try {
    return await invoke<AiProviderStatus>("get_ai_provider_status");
  } catch (error) {
    return {
      type: "manual",
      enabled: false,
      keySource: "env",
      hasStoredKey: false,
      hasEnvKey: false,
      available: false,
      message: errorMessage(error, "AI provider 상태를 확인하지 못했습니다."),
    };
  }
}

export async function saveAiProviderConfig(config: AiProviderSettings): Promise<AiProviderStatus> {
  if (!isTauri()) return getAiProviderStatus();
  return invoke<AiProviderStatus>("save_ai_provider_config", { config });
}

export async function saveAiProviderKey(apiKey: string): Promise<AiProviderStatus> {
  if (!isTauri()) return getAiProviderStatus();
  return invoke<AiProviderStatus>("save_ai_provider_key", { apiKey });
}

export async function clearAiProviderKey(): Promise<AiProviderStatus> {
  if (!isTauri()) return getAiProviderStatus();
  return invoke<AiProviderStatus>("clear_ai_provider_key");
}

export async function generateImportWithAi(
  prompt: string,
  inputText: string,
  imageFilenames: string[] = [],
): Promise<string> {
  if (!isTauri()) {
    throw new Error("AI provider는 데스크톱 앱에서만 사용할 수 있습니다.");
  }
  return invoke<string>("generate_import_with_ai", { prompt, inputText, imageFilenames });
}

export async function pickImages(): Promise<string[]> {
  if (!isTauri()) {
    return pickImagesBrowser();
  }

  const selected = await open({
    multiple: true,
    filters: [{ name: "이미지", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
  });

  if (!selected) return [];

  const paths = Array.isArray(selected) ? selected : [selected];
  const saved: string[] = [];

  for (const path of paths) {
    try {
      const filename = await invoke<string>("save_image", { sourcePath: path });
      saved.push(filename);
    } catch (error) {
      throw new Error(errorMessage(error, "이미지를 저장하지 못했습니다."), {
        cause: error,
      });
    }
  }

  return saved;
}

export function createBrowserImageKey(filename: string): string {
  return `img_${uuidv4()}_${filename}`;
}

async function validateImageHeader(file: File, extension: string): Promise<void> {
  const bytes = new Uint8Array((await file.arrayBuffer()).slice(0, 12));
  const png = bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if ((extension === "png" && !png) || (extension.startsWith("jp") && !jpeg) || (extension === "webp" && !webp)) {
    throw new Error(`${file.name}의 이미지 형식 또는 magic header를 확인할 수 없습니다.`);
  }
}

export async function saveImageFiles(files: FileList | File[]): Promise<string[]> {
  const names: string[] = [];
  try {
    for (const file of Array.from(files)) {
      const extension = file.name.match(/\.(png|jpe?g|webp)$/i)?.[1]?.toLowerCase();
      if (!extension) throw new Error(`${file.name}은(는) 지원하지 않는 이미지 형식입니다.`);
      const expectedMime = extension === "webp" ? "image/webp" : extension.startsWith("jp") ? "image/jpeg" : "image/png";
      if (file.type && file.type !== expectedMime) throw new Error(`${file.name}의 MIME 형식이 확장자와 일치하지 않습니다.`);
      if (file.size > MAX_IMPORT_IMAGE_BYTES) {
        throw new Error(`${file.name} 파일이 너무 큽니다. 이미지는 파일당 25MB 이하만 저장할 수 있습니다.`);
      }
      await validateImageHeader(file, extension);
      if (isTauri()) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const filename = await invoke<string>("save_import_image_bytes", {
          bytes,
          filename: file.name,
          mime: file.type || undefined,
        });
        names.push(filename);
        continue;
      }
      const dataUrl = await fileToDataUrl(file);
      const key = createBrowserImageKey(file.name);
      localStorage.setItem(key, dataUrl);
      names.push(key);
    }
  } catch (error) {
    await Promise.all(names.map((filename) => deleteImage(filename).catch(() => undefined)));
    throw new Error(errorMessage(error, "이미지를 저장하지 못했습니다."), { cause: error });
  }
  return names;
}

export async function saveImportAssetFiles(files: File[]): Promise<{ savedFilenames: string[]; savedAssets: Array<{ sourceName: string; sourceKey: string; savedFilename: string }>; sourceToSaved: Record<string, string> }> {
  const normalizedKeys = files.map((file) => normalizeImportImageKey(file.name));
  const duplicate = normalizedKeys.find((key, index) => normalizedKeys.indexOf(key) !== index);
  if (duplicate) throw new Error(`중복된 이미지 파일명이 있습니다: ${duplicate}`);
  const savedFilenames: string[] = [];
  const savedAssets: Array<{ sourceName: string; sourceKey: string; savedFilename: string }> = [];
  const sourceToSaved: Record<string, string> = {};
  try {
    for (const file of files) {
      const [saved] = await saveImageFiles([file]);
      savedFilenames.push(saved);
      const sourceKey = normalizeImportImageKey(file.name);
      sourceToSaved[sourceKey] = saved;
      savedAssets.push({ sourceName: file.name, sourceKey, savedFilename: saved });
    }
  } catch (error) {
    await Promise.all(savedFilenames.map((filename) => deleteImage(filename).catch(() => undefined)));
    throw error;
  }
  return { savedFilenames, savedAssets, sourceToSaved };
}

export function rewriteImportAssetReferences<T extends Partial<EntryFormData>>(data: T, sourceToSaved: Record<string, string>): T {
  return mapEntryImportImageReferences(data, (filename) => sourceToSaved[normalizeImportImageKey(filename)] ?? filename) as T;
}

async function pickImagesBrowser(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = async () => {
      const files = input.files;
      if (!files?.length) {
        resolve([]);
        return;
      }
      try {
        const names = await saveImageFiles(files);
        resolve(names);
      } catch (error) {
        reject(error);
      }
    };
    input.click();
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function getImageUrl(filename: string): Promise<string> {
  const cached = imageUrlCache.get(filename);
  if (cached) return cached;

  const localDataUrl = localStorage.getItem(filename);
  if (localDataUrl) {
    imageUrlCache.set(filename, localDataUrl);
    return localDataUrl;
  }

  if (!isTauri()) {
    return "";
  }

  try {
    const path = await invoke<string>("get_image_file_path", { filename });
    const url = convertFileSrc(path);
    imageUrlCache.set(filename, url);
    return url;
  } catch (error) {
    throw new Error(errorMessage(error, "이미지를 불러오지 못했습니다."), {
      cause: error,
    });
  }
}

export async function deleteImage(filename: string): Promise<void> {
  try {
    imageUrlCache.delete(filename);
    if (localStorage.getItem(filename)) {
      localStorage.removeItem(filename);
      if (!isTauri()) return;
    }
    if (!isTauri()) {
      return;
    }
    await invoke("delete_image", { filename });
  } catch (error) {
    throw new Error(errorMessage(error, "이미지를 삭제하지 못했습니다."), {
      cause: error,
    });
  }
}

export interface BackupPayload {
  meta: {
    version: 1;
    createdAt: string;
    source: "browser";
  };
  entries: WrongAnswerEntry[];
  settings: AppSettings;
  browserImages: Record<string, string>;
}

export interface RestoreBackupResult {
  restored: true;
  warnings: string[];
}

export interface ImportAssetStageResult {
  sessionId: string;
  sourceToStaged: Record<string, string>;
  assets: Array<{
    sourceName: string;
    stagedFilename: string;
    size: number;
    sha256: string;
    lastModified: number;
  }>;
}

export async function stageImportAssetFiles(files: File[]): Promise<ImportAssetStageResult | null> {
  if (!isTauri() || !files.length) return null;
  const sessionId = await invoke<string>("create_import_asset_session");
  const sourceToStaged: Record<string, string> = {};
  const assets: ImportAssetStageResult["assets"] = [];
  try {
    for (const file of files) {
      const result = await invoke<{ stagedFilename: string; sha256: string }>("stage_import_asset_bytes", {
        sessionId,
        sourceName: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        mime: file.type || undefined,
      });
      sourceToStaged[normalizeImportImageKey(file.name)] = result.stagedFilename;
      assets.push({
        sourceName: file.name,
        stagedFilename: result.stagedFilename,
        size: file.size,
        sha256: result.sha256,
        lastModified: file.lastModified,
      });
    }
    return { sessionId, sourceToStaged, assets };
  } catch (error) {
    await discardImportAssetSession(sessionId).catch(() => undefined);
    throw error;
  }
}

export interface ImportAssetSessionValidationResult {
  valid: boolean;
  missingFiles: string[];
  mismatchedFiles: string[];
}

export async function validateImportAssetSession(
  manifest: ImportAssetSessionManifest,
): Promise<ImportAssetSessionValidationResult> {
  if (manifest.mode !== "tauri-staged") return { valid: true, missingFiles: [], mismatchedFiles: [] };
  if (!isTauri()) return { valid: false, missingFiles: [], mismatchedFiles: ["데스크톱 자산 session"] };
  return invoke<ImportAssetSessionValidationResult>("validate_import_asset_session", { manifest });
}

export async function cleanupStaleImportAssetSessions(protectedSessionIds: string[] = []): Promise<number> {
  if (!isTauri()) return 0;
  return invoke<number>("cleanup_stale_import_asset_sessions", { protectedSessionIds });
}

export async function commitImportAssetSession(sessionId: string): Promise<string[]> {
  if (!isTauri()) return [];
  const result = await invoke<{ filenames: string[] }>("commit_import_asset_session", { sessionId });
  return result.filenames;
}

export async function discardImportAssetSession(sessionId: string): Promise<void> {
  if (isTauri()) await invoke("discard_import_asset_session", { sessionId });
}

export async function createBackup(entries: WrongAnswerEntry[], settings: AppSettings): Promise<string> {
  try {
    if (isTauri()) {
      const backupPath = await save({
        title: "백업 저장",
        defaultPath: `wrong-answer-backup-${new Date().toISOString().slice(0, 10)}.zip`,
        filters: [{ name: "ZIP", extensions: ["zip"] }],
      });
      if (!backupPath) return "백업이 취소되었습니다.";
      await invoke("create_backup_zip", { backupPath });
      return `백업을 저장했습니다: ${backupPath}`;
    }

    const payload: BackupPayload = {
      meta: {
        version: 1,
        createdAt: new Date().toISOString(),
        source: "browser",
      },
      entries,
      settings,
      browserImages: Object.fromEntries(
        Object.keys(localStorage)
          .filter((key) => key.startsWith("img_"))
          .map((key) => [key, localStorage.getItem(key) ?? ""]),
      ),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wrong-answer-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return "브라우저 백업 파일을 내려받았습니다.";
  } catch (error) {
    throw new Error(errorMessage(error, "백업을 만들지 못했습니다."), {
      cause: error,
    });
  }
}

export async function restoreBackup(): Promise<BackupPayload | RestoreBackupResult | null> {
  try {
    if (isTauri()) {
      const selected = await open({
        multiple: false,
        filters: [{ name: "ZIP", extensions: ["zip"] }],
      });
      if (!selected || Array.isArray(selected)) return null;
      return await invoke<RestoreBackupResult>("restore_backup_zip", { backupPath: selected });
    }

    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        try {
          const payload = JSON.parse(await file.text()) as BackupPayload;
          resolve(payload);
        } catch (error) {
          reject(error);
        }
      };
      input.click();
    });
  } catch (error) {
    throw new Error(errorMessage(error, "백업을 복원하지 못했습니다."), {
      cause: error,
    });
  }
}

export async function runNativeIntegrityCheck(): Promise<IntegrityReport | null> {
  if (!isTauri()) return null;
  return invoke<IntegrityReport>("run_integrity_check");
}

export async function previewOrphanImages(): Promise<OrphanImagePreview> {
  if (isTauri()) {
    return invoke<OrphanImagePreview>("preview_orphan_images");
  }

  const rawEntries = localStorage.getItem(ENTRIES_STORAGE_KEY);
  const entries = rawEntries ? parseStoredEntries(rawEntries) : [];
  const referenced = new Set(entries.flatMap(getAllImageFilenames));
  const filenames = Object.keys(localStorage).filter((key) => key.startsWith("img_") && !referenced.has(key));
  const totalBytes = filenames.reduce((sum, filename) => sum + (localStorage.getItem(filename)?.length ?? 0), 0);
  return { filenames, totalBytes };
}

export async function cleanupOrphanImages(): Promise<number> {
  if (isTauri()) {
    return invoke<number>("cleanup_orphan_images");
  }

  const rawEntries = localStorage.getItem(ENTRIES_STORAGE_KEY);
  const entries = rawEntries ? parseStoredEntries(rawEntries) : [];
  const referenced = new Set(entries.flatMap(getAllImageFilenames));
  let removed = 0;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("img_") && !referenced.has(key)) {
      localStorage.removeItem(key);
      imageUrlCache.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export async function createAutoBackup(): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string>("create_auto_backup");
}

export async function createPreUpdateBackup(fromVersion: string, toVersion: string): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string>("create_pre_update_backup", { fromVersion, toVersion });
}
