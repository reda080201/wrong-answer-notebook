import { useMemo, useState, type RefObject } from "react";
import type { ChatGptMcpPreferences } from "../../../types";
import Dialog from "../../../shared/ui/Dialog";
import {
  buildChatGptPrompt,
  openChatGpt,
  recommendedChatGptQuestions,
  type ChatGptPromptOptions,
  type ChatGptPromptMode,
} from "../services/chatGptConnection";

interface ChatGptHelpLauncherProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  mode: ChatGptPromptMode;
  preferences: ChatGptMcpPreferences;
  onPreferencesChange: (patch: Partial<ChatGptMcpPreferences>) => Promise<void> | void;
  onSyncContext: (sharing: Pick<
    ChatGptMcpPreferences,
    "shareUserResponse" | "shareScratchNote" | "shareQuestionImages" | "shareSourcePageImages"
  >) => Promise<void>;
  onCheckLocalMcp?: () => Promise<void>;
  remoteMcpConfigured?: boolean;
  onOpenSettings?: () => void;
  label?: string;
  questionContext?: ChatGptQuestionContext;
}

export interface ChatGptQuestionContext {
  questionNumber: string;
  body: string;
  choices: string[];
  response?: string;
  scratchNote?: string;
}

export default function ChatGptHelpLauncher({
  open,
  onOpenChange,
  returnFocusRef,
  mode,
  preferences,
  onPreferencesChange,
  onSyncContext,
  onCheckLocalMcp,
  remoteMcpConfigured = false,
  onOpenSettings,
  label = "ChatGPT에서 도움받기",
  questionContext,
}: ChatGptHelpLauncherProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const dialogOpen = open ?? internalOpen;
  const setDialogOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    else setInternalOpen(next);
  };
  const [selectedQuestion, setSelectedQuestion] = useState(() => recommendedChatGptQuestions(mode)[0]);
  const [status, setStatus] = useState<string | null>(null);
  const [fallbackPrompt, setFallbackPrompt] = useState<string | null>(null);
  const [shareExistingAnswersAndExplanations, setShareExistingAnswersAndExplanations] = useState(false);
  const [shareConfirmOpen, setShareConfirmOpen] = useState(false);
  const questions = useMemo(() => {
    const allQuestions = recommendedChatGptQuestions(mode);
    if (shareExistingAnswersAndExplanations && preferences.shareUserResponse) return allQuestions;
    return allQuestions.filter((question) => !question.includes("공식 해설과 내 풀이"));
  }, [mode, preferences.shareUserResponse, shareExistingAnswersAndExplanations]);
  const contextKey = questionContext?.questionNumber ?? "";
  const [editedPrompt, setEditedPrompt] = useState<{ contextKey: string; value: string } | null>(null);
  const activeQuestion = questions.includes(selectedQuestion) ? selectedQuestion : questions[0];
  const closeDialog = () => {
    setShareExistingAnswersAndExplanations(false);
    setDialogOpen(false);
    requestAnimationFrame(() => returnFocusRef?.current?.focus());
  };
  const basePrompt = useMemo(() => {
    const promptOptions: ChatGptPromptOptions = {
      shareUserResponse: preferences.shareUserResponse,
      shareScratchNote: preferences.shareScratchNote,
      shareExistingAnswersAndExplanations,
    };
    return buildChatGptPrompt(mode, activeQuestion, preferences, questionContext && {
      questionNumber: questionContext.questionNumber,
      questionText: questionContext.body,
      choices: questionContext.choices,
      response: questionContext.response,
      scratchNote: questionContext.scratchNote,
    }, promptOptions);
  }, [activeQuestion, mode, preferences, questionContext, shareExistingAnswersAndExplanations]);
  const prompt = editedPrompt?.contextKey === contextKey ? editedPrompt.value : basePrompt;
  const copyPrompt = async () => {
    setStatus(null);
    setFallbackPrompt(null);
    try {
      await navigator.clipboard.writeText(prompt);
      setStatus("문항 내용을 포함한 질문을 복사했습니다. ChatGPT에 붙여넣으세요.");
      return true;
    } catch (error) {
      setFallbackPrompt(prompt);
      setStatus(error instanceof Error ? error.message : "질문을 클립보드에 복사하지 못했습니다.");
      return false;
    }
  };

  const handleOpenChatGpt = async () => {
    setStatus(null);
    try {
      await openChatGpt();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "ChatGPT를 열지 못했습니다.");
      setFallbackPrompt(prompt);
    }
  };

  const handleCopyAndOpen = async () => {
    const copied = await copyPrompt();
    if (copied) await handleOpenChatGpt();
  };

  const handleSendToMcpTunnel = async () => {
    setStatus(null);
    try {
      await onSyncContext({
        shareUserResponse: preferences.shareUserResponse,
        shareScratchNote: preferences.shareScratchNote,
        shareQuestionImages: preferences.shareQuestionImages,
        shareSourcePageImages: preferences.shareSourcePageImages,
      });
      if (onCheckLocalMcp) await onCheckLocalMcp();
      setStatus("MCP 문맥 동기화를 완료했습니다. 메시지는 자동 전송되지 않습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "MCP 문맥 동기화에 실패했습니다. 연결을 확인하고 다시 시도해 주세요.");
    }
  };

  return (
    <div className="chatgpt-help-launcher">
      {!onOpenChange && <button type="button" className="btn-secondary" onClick={() => setDialogOpen(!dialogOpen)}>{label}</button>}
      <Dialog open={dialogOpen} size="xl" ariaLabel="ChatGPT에서 도움받기" title="ChatGPT에서 도움받기" onClose={closeDialog} header={<button type="button" className="btn-icon" aria-label="ChatGPT 도움 닫기" onClick={closeDialog}>닫기</button>} footer={<div className="chatgpt-help-actions">
        <button type="button" className="btn-secondary" onClick={() => void copyPrompt()}>질문 복사</button>
        <button type="button" className="btn-secondary" onClick={() => void handleSendToMcpTunnel()}>MCP 동기화</button>
        <button type="button" className="btn-secondary" onClick={() => void handleOpenChatGpt()}>ChatGPT 열기</button>
        <button type="button" className="btn-primary" onClick={() => void handleCopyAndOpen()}>복사 후 열기</button>
        {onOpenSettings && <button type="button" className="btn-secondary" onClick={onOpenSettings}>연결 설정</button>}
      </div>}>
        <section className="chatgpt-help-panel">
          <p>현재 문항과 선택한 질문을 복사합니다. MCP 동기화와 메시지 전송은 자동으로 하지 않습니다.</p>
          <p className="chatgpt-help-note">보안 터널: {remoteMcpConfigured ? "외부 HTTPS MCP URL 등록됨" : "외부 URL 미등록 - ChatGPT 연결 전 등록이 필요할 수 있습니다."}</p>
          <fieldset>
            <legend>공유할 내용</legend>
            <label><input type="checkbox" checked={preferences.shareUserResponse} onChange={(event) => void onPreferencesChange({ shareUserResponse: event.target.checked })} /> 내 답</label>
            <label><input type="checkbox" checked={preferences.shareScratchNote} onChange={(event) => void onPreferencesChange({ shareScratchNote: event.target.checked })} /> 풀이 메모</label>
            <label><input type="checkbox" checked={shareExistingAnswersAndExplanations} onChange={(event) => { if (event.target.checked) setShareConfirmOpen(true); else setShareExistingAnswersAndExplanations(false); }} /> 정답·해설 공유</label>
            <div className="chatgpt-help-mcp-options" aria-label="MCP 동기화 전용 공유 옵션">
              <span>MCP 동기화 전용</span>
              <label><input type="checkbox" checked={preferences.shareQuestionImages} onChange={(event) => void onPreferencesChange({ shareQuestionImages: event.target.checked })} /> 문항 직접 이미지</label>
              <label><input type="checkbox" checked={preferences.shareSourcePageImages} onChange={(event) => void onPreferencesChange({ shareSourcePageImages: event.target.checked })} /> 원본 전체 페이지</label>
            </div>
          </fieldset>
          <div className="chatgpt-help-questions" aria-label="추천 질문">
            {questions.map((question) => (
              <button key={question} type="button" className={activeQuestion === question ? "active" : ""} onClick={() => { setSelectedQuestion(question); setEditedPrompt(null); }}>{question}</button>
            ))}
          </div>
          <label className="chatgpt-help-prompt">복사할 질문<textarea value={prompt} onChange={(event) => setEditedPrompt({ contextKey, value: event.target.value })} rows={10} aria-label="편집할 ChatGPT 프롬프트" /></label>
          {status && <p className="form-error" role="status">{status}</p>}
          {fallbackPrompt && <textarea className="chatgpt-help-fallback" readOnly value={fallbackPrompt} aria-label="복사할 추천 질문" />}
          <p className="chatgpt-help-note">ChatGPT의 MCP 기능은 계정, 워크스페이스 및 단계적 출시 상태에 따라 다를 수 있습니다.</p>
        </section>
      </Dialog>
      <Dialog open={shareConfirmOpen} size="sm" ariaLabel="정답과 해설 공유 확인" title="정답과 해설을 공유할까요?" onClose={() => setShareConfirmOpen(false)} footer={<div className="chatgpt-help-actions"><button type="button" className="btn-secondary" onClick={() => setShareConfirmOpen(false)}>취소</button><button type="button" className="btn-primary" onClick={() => { setShareExistingAnswersAndExplanations(true); setShareConfirmOpen(false); }}>공유 허용</button></div>}>
        <p>정답과 해설이 질문 복사 및 MCP 동기화 문맥에 포함될 수 있습니다.</p>
      </Dialog>
    </div>
  );
}
