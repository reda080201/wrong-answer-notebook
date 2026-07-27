import type { ChatGptMcpPreferences, ExamPreferences, ExamSession } from "../types";
import type { SettingsTab } from "./SettingsModal";
import ExamSessionView from "../features/exam/components/ExamSessionView";

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
  return (
    <div className={`exam-session-overlay${generated ? " exam-session-overlay--generated" : ""}`}>
      {saveError && (
        <div className="exam-session-save-error" role="alert">
          <span>진행 상태 저장 실패: {saveError}</span>
          <button type="button" disabled={saving} onClick={onRetrySave}>다시 저장</button>
        </div>
      )}
      <button type="button" onClick={() => void onClose()} disabled={submitting || saving}>시험 닫기</button>
      <ExamSessionView
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
      />
    </div>
  );
}
