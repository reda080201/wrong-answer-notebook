import { useMemo, useState } from "react";
import type { ChatGptMcpPreferences, ExamSession, ExportScopeMode, McpSendOptions, WrongAnswerEntry } from "../../../types";
import { buildChatGptPrompt, openChatGpt, recommendedChatGptQuestions } from "../../chatgpt/services/chatGptConnection";
import { buildChatGptSharePayload } from "../services/buildChatGptSharePayload";
import { resolveExportQuestionNumbers } from "../services/resolveExportQuestionNumbers";
import type { ChatGptSharePayload } from "../types";

export type GptSolutionPurpose =
  | "hint"
  | "full_solution"
  | "wrong_answer_analysis"
  | "lecture"
  | "solution_and_lecture";

const SOLUTION_PURPOSES: Array<{ id: GptSolutionPurpose; label: string }> = [
  { id: "hint", label: "힌트" },
  { id: "full_solution", label: "완전한 해설" },
  { id: "wrong_answer_analysis", label: "오답 분석" },
  { id: "lecture", label: "특강형 정리" },
  { id: "solution_and_lecture", label: "해설과 특강 모두" },
];

const SCOPES: { id: ExportScopeMode; label: string }[] = [
  { id: "current", label: "현재 문항" },
  { id: "selected", label: "선택한 문항" },
  { id: "wrong", label: "틀린 문항" },
  { id: "important", label: "중요 문항" },
  { id: "marked", label: "검토 문항" },
  { id: "whole", label: "시험지 전체" },
  { id: "manual", label: "번호 직접 입력" },
];

export type ChatGptShareSyncPayload = {
  scope: ExportScopeMode;
  questionNumbers: string[];
  submitted: boolean;
  shareOptions: McpSendOptions;
};

interface ChatGptSharePanelProps {
  entry: WrongAnswerEntry;
  examSession?: ExamSession | null;
  currentQuestionNumber?: string;
  selectedQuestionNumbers?: string[];
  preferences: ChatGptMcpPreferences;
  onPreferencesChange: (patch: Partial<ChatGptMcpPreferences>) => Promise<void> | void;
  onSyncExportContext: (payload: ChatGptShareSyncPayload) => Promise<void>;
  onCheckLocalMcp?: () => Promise<void>;
  remoteMcpConfigured?: boolean;
  onOpenSettings?: () => void;
  onStartSolutionRoundtrip?: (input: {
    purpose: GptSolutionPurpose;
    questionNumbers: string[];
    payload: ChatGptSharePayload;
  }) => Promise<void>;
  onBack: () => void;
  initialScope?: ExportScopeMode;
  selectionOnly?: boolean;
}

export default function ChatGptSharePanel(props: ChatGptSharePanelProps) {
  const {
    entry,
    examSession,
    currentQuestionNumber,
    selectedQuestionNumbers = [],
    preferences,
    onPreferencesChange,
    onSyncExportContext,
    onCheckLocalMcp,
    remoteMcpConfigured = false,
    onOpenSettings,
    onStartSolutionRoundtrip,
    onBack,
    initialScope = "current",
    selectionOnly = false,
  } = props;
  const [scope, setScope] = useState<ExportScopeMode>(selectionOnly ? "selected" : initialScope);
  const [manualRange, setManualRange] = useState(selectedQuestionNumbers.join(", "));
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [purpose, setPurpose] = useState<GptSolutionPurpose>("full_solution");
  const [shareOptions, setShareOptions] = useState<McpSendOptions>(() => ({
    shareQuestionText: true,
    shareChoices: true,
    shareQuestionImages: preferences.shareQuestionImages,
    shareSourcePageImages: preferences.shareSourcePageImages,
    shareUserResponse: preferences.shareUserResponse,
    shareScratchNote: preferences.shareScratchNote,
    shareExistingAnswersAndExplanations: false,
  }));
  const [answerDisclosureConfirmed, setAnswerDisclosureConfirmed] = useState(false);
  const questions = useMemo(() => recommendedChatGptQuestions(examSession?.status === "submitted" ? "submitted" : examSession ? "pre-submit" : "detail"), [examSession]);
  const [selectedQuestion, setSelectedQuestion] = useState(questions[0] ?? "현재 공유된 문제를 읽어 줘.");
  const scopeResult = useMemo(() => resolveExportQuestionNumbers({ entry, scope, selectedNumbers: selectedQuestionNumbers, currentQuestionNumber, manualInput: manualRange, examSession }), [entry, scope, selectedQuestionNumbers, currentQuestionNumber, manualRange, examSession]);
  const submitted = examSession?.status === "submitted";
  const payload = useMemo(() => buildChatGptSharePayload({ entry, questionNumbers: scopeResult.questionNumbers, scope, examSession, preferences: shareOptions }), [entry, scopeResult.questionNumbers, scope, examSession, shareOptions]);
  const canSend = scopeResult.questionNumbers.length > 0
    && !scopeResult.disabledReason
    && (!shareOptions.shareExistingAnswersAndExplanations || answerDisclosureConfirmed);
  const prompt = buildChatGptPrompt(examSession?.status === "submitted" ? "submitted" : examSession ? "pre-submit" : "detail", selectedQuestion, preferences);
  const handleShare = async () => {
    if (!canSend) return;
    setBusy(true);
    setStatus(null);
    try {
      await onSyncExportContext({
        scope,
        questionNumbers: scopeResult.questionNumbers,
        submitted,
        shareOptions,
      });
      if (onCheckLocalMcp) await onCheckLocalMcp();
      if (preferences.copyPromptBeforeOpen) await navigator.clipboard.writeText(prompt);
      if (preferences.openChatGptAfterCopy) await openChatGpt();
      setStatus(remoteMcpConfigured ? "공유 범위를 저장했고 추천 질문을 복사했습니다." : "로컬 MCP 컨텍스트를 저장했습니다. Secure MCP Tunnel이 없으면 직접 연결 완료로 표시하지 않습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "ChatGPT 전달을 준비하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleSolutionRoundtrip = async () => {
    if (!onStartSolutionRoundtrip || !canSend) return;
    setBusy(true);
    setStatus(null);
    try {
      await onSyncExportContext({
        scope,
        questionNumbers: scopeResult.questionNumbers,
        submitted,
        shareOptions,
      });
      await onStartSolutionRoundtrip({ purpose, questionNumbers: scopeResult.questionNumbers, payload });
      setStatus("선택 문항 snapshot을 저장했습니다. 안내문을 ChatGPT에 보낸 뒤 JSON 응답을 가져와 문항별로 검토하세요.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "GPT 해설 왕복을 시작하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="export-chatgpt-share-panel">
      <header className="export-panel-header">
        <div>
          <h3>{selectionOnly ? "MCP로 선택 문제 보내기" : "ChatGPT로 문제 보내기"}</h3>
          <p>ChatGPT가 문제 데이터를 구조적으로 읽을 수 있도록 공유합니다. PDF 파일을 만들지 않으며, 선택한 문항과 공유 범위만 전달합니다.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={onBack}>뒤로</button>
      </header>
      <section>
        <h4>범위</h4>
        {selectionOnly ? (
          <ol className="export-selected-question-list" aria-label="선택 문항 목록">
            {scopeResult.questionNumbers.map((number) => <li key={number}>{number}번</li>)}
          </ol>
        ) : <div className="export-scope-row">
          {SCOPES.map((item) => (
            <label key={item.id}>
              <input type="radio" name="chatgpt-scope" checked={scope === item.id} onChange={() => setScope(item.id)} /> {item.label}
            </label>
          ))}
        </div>}
        {!selectionOnly && scope === "manual" ? <input className="input" value={manualRange} onChange={(event) => setManualRange(event.target.value)} placeholder="예: 1-5, 8, 10-14" /> : null}
        {scopeResult.disabledReason ? <p className="form-error">{scopeResult.disabledReason}</p> : <p className="muted">공유 문항 {payload.questionNumbers.length}개 · 정답 보호 {payload.answerProtection}</p>}
      </section>
      {onStartSolutionRoundtrip ? (
        <section>
          <h4>선택 문항 해설 왕복</h4>
          <select aria-label="GPT 해설 요청 목적" value={purpose} onChange={(event) => setPurpose(event.target.value as GptSolutionPurpose)}>
            {SOLUTION_PURPOSES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <p className="muted">원본은 수정하지 않습니다. 응답 JSON을 가져온 뒤 문항별 차이를 승인해야 저장됩니다.</p>
          <button type="button" className="btn-secondary" disabled={busy || !scopeResult.questionNumbers.length || Boolean(scopeResult.disabledReason)} onClick={() => void handleSolutionRoundtrip()}>
            {busy ? "snapshot 저장 중..." : "GPT 해설 왕복 시작"}
          </button>
        </section>
      ) : null}
      <section>
        <h4>공유 내용</h4>
        <label><input type="checkbox" checked={shareOptions.shareQuestionText} onChange={(event) => setShareOptions((current) => ({ ...current, shareQuestionText: event.target.checked }))} /> 문제 본문</label>
        <label><input type="checkbox" checked={shareOptions.shareChoices} onChange={(event) => setShareOptions((current) => ({ ...current, shareChoices: event.target.checked }))} /> 선택지</label>
        <label><input type="checkbox" checked={shareOptions.shareQuestionImages} onChange={(event) => { void onPreferencesChange({ shareQuestionImages: event.target.checked }); setShareOptions((current) => ({ ...current, shareQuestionImages: event.target.checked })); }} /> 직접 연결 문제 그림</label>
        <label><input type="checkbox" checked={shareOptions.shareUserResponse} onChange={(event) => { void onPreferencesChange({ shareUserResponse: event.target.checked }); setShareOptions((current) => ({ ...current, shareUserResponse: event.target.checked })); }} /> 내 답</label>
        <label><input type="checkbox" checked={shareOptions.shareScratchNote} onChange={(event) => { void onPreferencesChange({ shareScratchNote: event.target.checked }); setShareOptions((current) => ({ ...current, shareScratchNote: event.target.checked })); }} /> 풀이 메모</label>
        <label><input type="checkbox" checked={shareOptions.shareSourcePageImages} onChange={(event) => { void onPreferencesChange({ shareSourcePageImages: event.target.checked }); setShareOptions((current) => ({ ...current, shareSourcePageImages: event.target.checked })); }} /> 원본 페이지</label>
        <label><input type="checkbox" checked={shareOptions.shareExistingAnswersAndExplanations} onChange={(event) => { setShareOptions((current) => ({ ...current, shareExistingAnswersAndExplanations: event.target.checked })); setAnswerDisclosureConfirmed(false); }} /> 기존 정답·해설</label>
        {shareOptions.shareExistingAnswersAndExplanations && <label className="form-warning"><input type="checkbox" checked={answerDisclosureConfirmed} onChange={(event) => setAnswerDisclosureConfirmed(event.target.checked)} /> 선택 문항의 정답과 해설이 MCP에 공개됨을 확인했습니다.</label>}
      </section>
      <section>
        <h4>추천 질문</h4>
        <select value={selectedQuestion} onChange={(event) => setSelectedQuestion(event.target.value)}>
          {questions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <pre className="export-prompt-preview">{prompt}</pre>
      </section>
      {status ? <p className="muted">{status}</p> : null}
      <footer className="export-panel-footer">
        {onOpenSettings ? <button type="button" className="btn-secondary" onClick={onOpenSettings}>설정</button> : null}
        <button type="button" className="btn-primary" disabled={busy || !canSend} onClick={() => void handleShare()}>
          {busy ? "전달 준비 중..." : selectionOnly ? `${scopeResult.questionNumbers.length}문제 보내기` : "ChatGPT/MCP 전달"}
        </button>
      </footer>
    </div>
  );
}

