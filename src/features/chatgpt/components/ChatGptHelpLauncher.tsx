import { useEffect, useMemo, useState } from "react";
import type { ChatGptMcpPreferences } from "../../../types";
import Dialog from "../../../shared/ui/Dialog";
import {
  buildChatGptPrompt,
  openChatGpt,
  recommendedChatGptQuestions,
  type ChatGptPromptMode,
} from "../services/chatGptConnection";

interface ChatGptHelpLauncherProps {
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
}

export default function ChatGptHelpLauncher({
  mode,
  preferences,
  onPreferencesChange,
  onSyncContext,
  onCheckLocalMcp,
  remoteMcpConfigured = false,
  onOpenSettings,
  label = "ChatGPT에서 도움받기",
}: ChatGptHelpLauncherProps) {
  const [open, setOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState(() => recommendedChatGptQuestions(mode)[0]);
  const [status, setStatus] = useState<string | null>(null);
  const [fallbackPrompt, setFallbackPrompt] = useState<string | null>(null);
  const questions = useMemo(() => recommendedChatGptQuestions(mode), [mode]);
  const generatedPrompt = buildChatGptPrompt(mode, selectedQuestion, preferences);
  const [prompt, setPrompt] = useState(generatedPrompt);
  useEffect(() => { setPrompt(buildChatGptPrompt(mode, selectedQuestion, preferences)); }, [generatedPrompt, mode, selectedQuestion]);

  const syncAndCopy = async () => {
    setStatus(null);
    setFallbackPrompt(null);
    try {
      await onSyncContext({
        shareUserResponse: preferences.shareUserResponse,
        shareScratchNote: preferences.shareScratchNote,
        shareQuestionImages: preferences.shareQuestionImages,
        shareSourcePageImages: preferences.shareSourcePageImages,
      });
      if (onCheckLocalMcp) await onCheckLocalMcp();
      await navigator.clipboard.writeText(prompt);
      setStatus("추천 질문을 복사했습니다. ChatGPT 입력창에 붙여넣으세요.");
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
    const copied = preferences.copyPromptBeforeOpen ? await syncAndCopy() : true;
    if (copied && preferences.openChatGptAfterCopy) await handleOpenChatGpt();
  };

  return (
    <div className="chatgpt-help-launcher">
      <button type="button" className="btn-secondary" onClick={() => setOpen((value) => !value)}>
        {label}
      </button>
      <Dialog open={open} size="xl" ariaLabel="ChatGPT에서 도움받기" title="ChatGPT에서 도움받기" onClose={() => setOpen(false)} footer={<div className="chatgpt-help-actions">
        <button type="button" className="btn-secondary" onClick={() => void syncAndCopy()}>질문 복사</button>
        <button type="button" className="btn-secondary" onClick={() => void handleOpenChatGpt()}>ChatGPT 열기</button>
        <button type="button" className="btn-primary" onClick={() => void handleCopyAndOpen()}>질문 복사 후 ChatGPT 열기</button>
        {onOpenSettings && <button type="button" className="btn-secondary" onClick={onOpenSettings}>연결 설정</button>}
      </div>}>
        <section className="chatgpt-help-panel">
          <header>
            <div>
              <p>문맥을 동기화하고 질문만 복사합니다. 메시지는 자동 전송하지 않습니다.</p>
            </div>
          </header>
          <p className="chatgpt-help-note">보안 터널: {remoteMcpConfigured ? "외부 HTTPS MCP URL 등록됨" : "외부 URL 미등록 - ChatGPT 연결 전 등록이 필요할 수 있습니다."}</p>
          <fieldset>
            <legend>공유할 내용</legend>
            <label><input type="checkbox" checked={preferences.shareUserResponse} onChange={(event) => void onPreferencesChange({ shareUserResponse: event.target.checked })} /> 내 답</label>
            <label><input type="checkbox" checked={preferences.shareScratchNote} onChange={(event) => void onPreferencesChange({ shareScratchNote: event.target.checked })} /> 풀이 메모</label>
            <label><input type="checkbox" checked={preferences.shareQuestionImages} onChange={(event) => void onPreferencesChange({ shareQuestionImages: event.target.checked })} /> 문항 직접 이미지</label>
            <label><input type="checkbox" checked={preferences.shareSourcePageImages} onChange={(event) => void onPreferencesChange({ shareSourcePageImages: event.target.checked })} /> 원본 전체 페이지</label>
          </fieldset>
          <div className="chatgpt-help-questions" aria-label="추천 질문">
            {questions.map((question) => (
              <button key={question} type="button" className={selectedQuestion === question ? "active" : ""} onClick={() => { setSelectedQuestion(question); setPrompt(buildChatGptPrompt(mode, question, preferences)); }}>{question}</button>
            ))}
          </div>
          <label className="chatgpt-help-prompt">보낼 프롬프트<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={10} aria-label="편집할 ChatGPT 프롬프트" /></label>
          {status && <p className="form-error" role="status">{status}</p>}
          {fallbackPrompt && <textarea className="chatgpt-help-fallback" readOnly value={fallbackPrompt} aria-label="복사할 추천 질문" />}
          <p className="chatgpt-help-note">ChatGPT의 MCP 기능은 계정, 워크스페이스 및 단계적 출시 상태에 따라 다를 수 있습니다.</p>
        </section>
      </Dialog>
    </div>
  );
}
