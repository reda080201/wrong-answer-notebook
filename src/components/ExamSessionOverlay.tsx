import type { ChatGptMcpPreferences, ExamPreferences, ExamSession } from "../types";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { SettingsTab } from "./SettingsModal";
import ExamSessionView from "../features/exam/components/ExamSessionView";
import RealExamSessionView from "../features/exam/components/RealExamSessionView";

interface ExamSessionOverlayProps {
  session: ExamSession;
  generated: boolean;
  examPreferences: ExamPreferences;
  onOpenSettings: (tab?: SettingsTab) => void;
  chatGptPreferences: ChatGptMcpPreferences;
  onChatGptPreferencesChange: (patch: Partial<ChatGptMcpPreferences>) => Promise<void> | void;
  onSyncChatGptContext: (sharing: Pick<ChatGptMcpPreferences, "shareUserResponse" | "shareScratchNote" | "shareQuestionImages" | "shareSourcePageImages">) => Promise<void>;
  onOpenChatGptSettings: () => void;
  onCheckLocalMcp: () => Promise<void>;
  remoteMcpConfigured: boolean;
  onChange: (session: ExamSession) => void;
  onSubmittingChange: (submitting: boolean) => void;
  onSubmit: (session: ExamSession) => void | Promise<void>;
  onClose: () => void;
  submitting: boolean;
  saving: boolean;
  saveError: string | null;
  onRetrySave: () => void;
}

export default function ExamSessionOverlay({
  session,
  generated,
  examPreferences,
  onOpenSettings,
  chatGptPreferences,
  onChatGptPreferencesChange,
  onSyncChatGptContext,
  onOpenChatGptSettings,
  onCheckLocalMcp,
  remoteMcpConfigured,
  onChange,
  onSubmittingChange,
  onSubmit,
  onClose,
  submitting,
  saving,
  saveError,
  onRetrySave,
}: ExamSessionOverlayProps) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);
  const content = session.mode === "real" ? <RealExamSessionView
    session={session}
    onChange={onChange}
    onSubmittingChange={onSubmittingChange}
    onSubmit={onSubmit}
    examPreferences={examPreferences}
    onClose={onClose}
    closeDisabled={submitting || saving}
    saveError={saveError}
    saving={saving}
    onRetrySave={onRetrySave}
  /> : <ExamSessionView
    session={session}
    examPreferences={examPreferences}
    onOpenSettings={onOpenSettings}
    chatGptPreferences={chatGptPreferences}
    onChatGptPreferencesChange={onChatGptPreferencesChange}
    onSyncChatGptContext={onSyncChatGptContext}
    onOpenChatGptSettings={onOpenChatGptSettings}
    onCheckLocalMcp={onCheckLocalMcp}
    remoteMcpConfigured={remoteMcpConfigured}
    onChange={onChange}
    onSubmittingChange={onSubmittingChange}
    onSubmit={onSubmit}
    onClose={onClose}
  />;

  const overlay = (
    <div className={`exam-session-overlay${generated ? " exam-session-overlay--generated" : ""}${session.mode === "real" ? " exam-session-overlay--real" : ""}`}>
      {saveError && session.mode !== "real" && (
        <div className="exam-session-save-error" role="alert">
          <span>진행 상태 저장 실패: {saveError}</span>
          <button type="button" disabled={saving} onClick={onRetrySave}>다시 저장</button>
        </div>
      )}
      {content}
    </div>
  );
  return createPortal(overlay, document.body);
}
