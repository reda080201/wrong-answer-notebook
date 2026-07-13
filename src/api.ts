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
  McpBridgeSettings,
  McpBridgeStatus,
  McpBridgePairingSession,
  MemoTemplate,
  PromptTemplate,
  WrongAnswerEntry,
} from "./types";
import { normalizeEntry } from "./utils/entry";

const imageUrlCache = new Map<string, string>();
const ENTRIES_STORAGE_KEY = "wrong-answer-entries";
const SETTINGS_STORAGE_KEY = "wrong-answer-settings";
const MAX_BROWSER_IMAGE_BYTES = 10 * 1024 * 1024;
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

export const defaultSettings: AppSettings = {
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
};

export const builtInPromptTemplates: PromptTemplate[] = [
  {
    id: "builtin-sheet-png-package",
    name: "시험지+답안지+PNG 패키지",
    builtIn: true,
    content: `사진 속 문제지와 답안지를 오답노트 앱에 넣을 import.json과 PNG 이미지 파일로 정리해줘.

규칙:
- 가능하면 import.json과 graph_1.png 같은 이미지 파일들을 ZIP 하나로 묶어줘.
- ZIP이 어렵다면 import.json과 PNG/JPG/WebP 파일들을 따로 내려받을 수 있게 제공해줘.
- JSON에 base64 이미지, data URL, Markdown 이미지 링크는 절대 넣지 마.
- JSON은 순수 객체 1개여야 하고, import.json 파일 안에 저장할 내용만 포함해줘.
- 도표/그래프/그림은 가능한 한 깨끗한 PNG로 다시 만들고, JSON figures[].image에 실제 파일명만 적어줘.
- figures[].image 파일명과 실제 이미지 파일명은 대소문자까지 정확히 맞춰줘.
- 문제 번호가 불확실한 도표는 questionNumber를 빈 문자열로 두고 needsReview를 true로 표시해줘.
- 손글씨, 밑줄, 별표, 동그라미, 여백 메모, 학생 풀이 흔적은 question, memo, importantNotes, answerKey에 넣지 말고 rejectedNotes에만 기록해줘.
- audit에는 예상/감지/누락/불확실 문제 번호, 손글씨 제외 여부, 검토 필요 개수를 반드시 기록해줘.
- 해설에서 특강 카드로 쓸 수 있는 answerKey[].strategy, steps, wrongPoint, reviewPoint, concepts를 가능한 한 구체적으로 채워줘.
- 문항별 오답 원인을 판단할 수 있으면 answerKey[].mistakeAnalysis에 causes, primaryCause, preventionNote, practiceMode를 넣어 문항별 분석에 연결해줘. 전체 원인과 특정 문항 원인을 섞지 마.
- 시각화가 실제 이해에 도움이 되는 경우에만 answerKey[].diagramSpec 또는 learningBlocks[].diagramSpec을 넣어줘. 단순 계산 문제에는 만들지 말고, 한 문항당 최대 1개, 전체 learningBlocks diagram은 최대 3개까지만 허용해.
- raw HTML, raw SVG, base64 이미지, script, iframe 문자열은 절대 넣지 마.
- tags 필드와 최상위 difficulty 필드는 만들지 마.

import.json 형식:
{
  "title": "시험지 제목",
  "subject": "수학",
  "question": "1. ...\\n① ...",
  "importantNotes": ["전체적으로 알아둘 점"],
  "memo": "전체 학습 메모",
  "rejectedNotes": ["학생 필기로 의심되어 제외한 내용"],
  "audit": {
    "expectedQuestionNumbers": ["1"],
    "detectedQuestionNumbers": ["1"],
    "missingQuestionNumbers": [],
    "uncertainQuestionNumbers": [],
    "handwritingExcluded": true,
    "needsReviewCount": 0
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
  "figures": [
    {
      "questionNumber": "1",
      "title": "1번 그래프",
      "caption": "그래프의 축, 교점, 표시값을 설명",
      "image": "graph_1.png",
      "source": "gpt_cleaned",
      "needsReview": false
    }
  ],
  "concepts": ["함수", "그래프"],
  "learningBlocks": []
}`,
  },
  {
    id: "builtin-sheet-answer-json",
    name: "시험지+답안지 JSON",
    builtIn: true,
    content: `사진 속 문제지와 답안지를 오답노트 앱에 넣을 JSON으로 정리해줘.

규칙:
- 반드시 순수 JSON 객체 1개만 출력해줘. 첫 글자는 {, 마지막 글자는 } 이어야 해.
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
    return normalizeSettings(raw ? JSON.parse(raw) : defaultSettings);
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
    answerViewPreferences: {
      viewMode: raw?.answerViewPreferences?.viewMode === "table" ? "table" : "card",
      hideAnswers: Boolean(raw?.answerViewPreferences?.hideAnswers),
    },
    autoBackup: {
      enabled: Boolean(raw?.autoBackup?.enabled),
      lastBackupAt: raw?.autoBackup?.lastBackupAt,
    },
    mcpBridge: normalizeMcpBridgeSettings(raw?.mcpBridge),
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
  const [code, status] = await Promise.all([
    invoke<string>("create_mcp_bridge_pairing_code"),
    getMcpBridgeStatus(),
  ]);
  return {
    code,
    // The bridge currently fixes pairing-code TTL at five minutes. No credential is returned here.
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    bridgeUrl: `http://127.0.0.1:${status.port}/pair`,
  };
}

/** Invalidates the current bridge credential without exposing its value to the UI. */
export async function rotateMcpBridgeCredential(): Promise<McpBridgeStatus> {
  if (!isTauri()) return browserMcpBridgeStatus;
  await invoke("rotate_mcp_bridge_token");
  return getMcpBridgeStatus();
}

/** Closes authenticated clients and invalidates their server-side session. */
export async function disconnectMcpBridgeClients(): Promise<McpBridgeStatus> {
  if (!isTauri()) return browserMcpBridgeStatus;
  await invoke("disconnect_mcp_bridge");
  return getMcpBridgeStatus();
}

export async function syncMcpBridgeActiveContext(context: McpActiveContext): Promise<void> {
  if (!isTauri()) return;
  await invoke("sync_active_context", {
    entryId: context.entryId,
    questionNumber: context.questionNumber,
  });
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

export async function saveImageFiles(files: FileList | File[]): Promise<string[]> {
  const names: string[] = [];
  for (const file of Array.from(files)) {
    if (!file.type.startsWith("image/")) continue;
    if (file.size > MAX_BROWSER_IMAGE_BYTES) {
      throw new Error(`${file.name} 파일이 너무 큽니다. 이미지는 파일당 10MB 이하만 저장할 수 있습니다.`);
    }
    const dataUrl = await fileToDataUrl(file);
    const key = createBrowserImageKey(file.name);
    localStorage.setItem(key, dataUrl);
    names.push(key);
  }
  return names;
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

export async function restoreBackup(): Promise<BackupPayload | null> {
  try {
    if (isTauri()) {
      const selected = await open({
        multiple: false,
        filters: [{ name: "ZIP", extensions: ["zip"] }],
      });
      if (!selected || Array.isArray(selected)) return null;
      await invoke("restore_backup_zip", { backupPath: selected });
      return null;
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

export async function cleanupOrphanImages(referencedImages: string[]): Promise<number> {
  if (isTauri()) {
    return invoke<number>("cleanup_orphan_images", { referencedImages });
  }

  let removed = 0;
  const referenced = new Set(referencedImages);
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
