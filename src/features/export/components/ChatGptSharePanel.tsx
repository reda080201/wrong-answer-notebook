import { useEffect, useMemo, useState } from "react";
import type { ChatGptMcpPreferences, ExamSession, ExportScopeMode, McpSendOptions, WrongAnswerEntry } from "../../../types";
import { clearMcpSharedContexts, getMcpSharedContextStatus } from "../../../api";
import { openChatGpt, recommendedChatGptQuestions } from "../../chatgpt/services/chatGptConnection";
import { buildChatGptSharePrompt } from "../services/buildChatGptSharePrompt";
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
  const [sharedQuestionCount, setSharedQuestionCount] = useState(0);
  const [sharedAt, setSharedAt] = useState<string | null>(null);
  const [sharedError, setSharedError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getMcpSharedContextStatus().then((status) => {
      if (active) {
        setSharedQuestionCount(status.exportShared ? status.questionCount : 0);
        setSharedAt(status.exportShared ? status.sharedAt ?? null : null);
      }
    });
    return () => { active = false; };
  }, []);
  const handleClearSharedContext = async () => {
    try {
      await clearMcpSharedContexts();
      setSharedQuestionCount(0);
      setSharedAt(null);
      setSharedError(null);
    } catch (error) {
      setSharedError(error instanceof Error ? error.message : "공유 해제에 실패했습니다.");
    }
  };
  const promptMode = examSession?.status === "submitted" ? "submitted" : examSession ? "pre-submit" : "detail";
  const questions = useMemo(() => {
    if (!shareOptions.shareQuestionText && !shareOptions.shareChoices) return ["공유한 학습 정보만 바탕으로 조언해 줘"];
    return recommendedChatGptQuestions(promptMode).filter((item) => {
      if (!shareOptions.shareUserResponse && /내 답|내 풀이|내 접근/.test(item)) return false;
      if (!shareOptions.shareExistingAnswersAndExplanations && /공식 해설과 .*비교/.test(item)) return false;
      if (shareOptions.shareExistingAnswersAndExplanations && /정답은 말하지 말고/.test(item)) return false;
      return true;
    });
  }, [promptMode, shareOptions.shareQuestionText, shareOptions.shareChoices, shareOptions.shareUserResponse, shareOptions.shareExistingAnswersAndExplanations]);
  const [selectedQuestion, setSelectedQuestion] = useState(questions[0] ?? "현재 공유된 문제를 읽어 줘.");
  const activeSelectedQuestion = questions.includes(selectedQuestion) ? selectedQuestion : questions[0] ?? "공유한 내용만 검토해 줘";
  const scopeResult = useMemo(() => resolveExportQuestionNumbers({ entry, scope, selectedNumbers: selectedQuestionNumbers, currentQuestionNumber, manualInput: manualRange, examSession }), [entry, scope, selectedQuestionNumbers, currentQuestionNumber, manualRange, examSession]);
  const submitted = examSession?.status === "submitted";
  const payload = useMemo(() => buildChatGptSharePayload({ entry, questionNumbers: scopeResult.questionNumbers, scope, examSession, preferences: shareOptions }), [entry, scopeResult.questionNumbers, scope, examSession, shareOptions]);
  const canSend = scopeResult.questionNumbers.length > 0
    && !scopeResult.disabledReason
    && (!shareOptions.shareExistingAnswersAndExplanations || answerDisclosureConfirmed);
  const prompt = buildChatGptSharePrompt(payload, activeSelectedQuestion);
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
      setStatus(remoteMcpConfigured ? "MCP 공유 범위를 저장했습니다." : "MCP 문맥을 저장했습니다. 외부 전송은 실행하지 않았습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "ChatGPT 전달을 준비하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleCopyPrompt = async () => {
    if (!canSend) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setStatus("질문을 복사했습니다. ChatGPT에 붙여넣으세요.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "질문을 복사하지 못했습니다.");
    }
  };

  const handleOpenChatGpt = async () => {
    try {
      await openChatGpt();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "ChatGPT를 열지 못했습니다.");
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
      const sharedStatus = await getMcpSharedContextStatus();
      setSharedQuestionCount(sharedStatus.questionCount);
      setSharedAt(sharedStatus.sharedAt ?? new Date().toISOString());
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
          <h3>{selectionOnly ? "MCP로 선택 문제 공유" : "MCP 공유"}</h3>
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
        {scopeResult.disabledReason ? <p className="form-error">{scopeResult.disabledReason}</p> : <p className="muted">공유 문항 {payload.questionNumbers.length}개 · {payload.answerProtection === "active" ? "정답·해설 공유 안 함" : "정답·해설 공유"}</p>}
      </section>
      <section className="mcp-share-receipt" aria-live="polite">
        <span>{sharedQuestionCount > 0 ? `${sharedQuestionCount}문제 공유됨${sharedAt ? ` · ${new Date(sharedAt).toLocaleTimeString("ko-KR")}` : ""}` : "문제 공유 안 됨"}</span>
        {sharedQuestionCount > 0 && <button type="button" className="btn-secondary btn-sm" onClick={() => void handleClearSharedContext()}>공유 해제</button>}
        {sharedError && <span className="form-error">{sharedError}</span>}
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
        <label><input type="checkbox" checked={shareOptions.shareUserResponse} onChange={(event) => { void onPreferencesChange({ shareUserResponse: event.target.checked }); setShareOptions((current) => ({ ...current, shareUserResponse: event.target.checked })); }} /> 내 답</label>
        <label><input type="checkbox" checked={shareOptions.shareScratchNote} onChange={(event) => { void onPreferencesChange({ shareScratchNote: event.target.checked }); setShareOptions((current) => ({ ...current, shareScratchNote: event.target.checked })); }} /> 풀이 메모</label>
        <fieldset className="export-mcp-only-options">
          <legend>MCP 동기화 전용</legend>
          <label><input type="checkbox" checked={shareOptions.shareQuestionImages} onChange={(event) => { void onPreferencesChange({ shareQuestionImages: event.target.checked }); setShareOptions((current) => ({ ...current, shareQuestionImages: event.target.checked })); }} /> 직접 연결 문제 그림</label>
          <label><input type="checkbox" checked={shareOptions.shareSourcePageImages} onChange={(event) => { void onPreferencesChange({ shareSourcePageImages: event.target.checked }); setShareOptions((current) => ({ ...current, shareSourcePageImages: event.target.checked })); }} /> 원본 페이지</label>
        </fieldset>
        <label><input type="checkbox" checked={shareOptions.shareExistingAnswersAndExplanations} onChange={(event) => { setShareOptions((current) => ({ ...current, shareExistingAnswersAndExplanations: event.target.checked })); setAnswerDisclosureConfirmed(false); }} /> 기존 정답·해설 공유</label>
        {shareOptions.shareExistingAnswersAndExplanations && <label className="form-warning"><input type="checkbox" checked={answerDisclosureConfirmed} onChange={(event) => setAnswerDisclosureConfirmed(event.target.checked)} /> 선택 문항의 정답과 해설이 복사 또는 MCP 문맥에 포함됨을 확인했습니다.</label>}
      </section>
      <section>
        <h4>추천 질문</h4>
        <select value={activeSelectedQuestion} onChange={(event) => setSelectedQuestion(event.target.value)}>
          {questions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <pre className="export-prompt-preview">{prompt}</pre>
      </section>
      {status ? <p className="muted">{status}</p> : null}
      <footer className="export-panel-footer">
        {onOpenSettings ? <button type="button" className="btn-secondary" onClick={onOpenSettings}>설정</button> : null}
        <button type="button" className="btn-secondary" disabled={busy || !canSend} onClick={() => void handleCopyPrompt()}>질문 복사</button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void handleOpenChatGpt()}>ChatGPT 열기</button>
        <button type="button" className="btn-primary" disabled={busy || !canSend} onClick={() => void handleShare()}>{busy ? "동기화 중..." : "MCP 동기화"}</button>
      </footer>
    </div>
  );
}

