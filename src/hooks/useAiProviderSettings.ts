import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  clearAiProviderKey,
  getAiProviderStatus,
  saveAiProviderConfig,
  saveAiProviderKey,
} from "../api";
import type { AiProviderSettings, AiProviderStatus } from "../types";

interface UseAiProviderSettingsOptions {
  aiProvider: AiProviderSettings;
  refreshSettings: () => Promise<boolean>;
  setSettingsMessage: (message: string | null) => void;
}

export function useAiProviderSettings({
  aiProvider,
  refreshSettings,
  setSettingsMessage,
}: UseAiProviderSettingsOptions) {
  const [aiProviderStatus, setAiProviderStatus] =
    useState<AiProviderStatus | null>(null);
  const [aiProviderStatusLoading, setAiProviderStatusLoading] = useState(false);
  const [aiProviderStatusError, setAiProviderStatusError] = useState<string | null>(null);
  const [aiProviderKeyInput, setAiProviderKeyInput] = useState("");
  const statusRequestRef = useRef(0);

  const refreshAiProviderStatus = useCallback(() => {
    const requestId = ++statusRequestRef.current;
    setAiProviderStatus(null);
    setAiProviderStatusLoading(true);
    setAiProviderStatusError(null);
    return getAiProviderStatus()
      .then((status) => {
        if (statusRequestRef.current === requestId) {
          setAiProviderStatus(status);
          setAiProviderStatusError(null);
        }
      })
      .catch((statusError: unknown) => {
        if (statusRequestRef.current === requestId) {
          const message = statusError instanceof Error ? statusError.message : "AI Provider 상태를 불러오지 못했습니다.";
          setAiProviderStatus(null);
          setAiProviderStatusError(message);
          setSettingsMessage(message);
        }
      }).finally(() => {
        if (statusRequestRef.current === requestId) setAiProviderStatusLoading(false);
      });
  }, [setSettingsMessage]);

  useEffect(() => {
    void refreshAiProviderStatus();
  }, [aiProvider, refreshAiProviderStatus]);

  const updateAiProviderConfig = async (patch: Partial<AiProviderSettings>) => {
    const requestId = ++statusRequestRef.current;
    setAiProviderStatus(null);
    setAiProviderStatusLoading(true);
    setAiProviderStatusError(null);
    const next: AiProviderSettings = {
      ...aiProvider,
      ...patch,
    };
    if (next.type === "manual") next.enabled = false;
    try {
      const status = await saveAiProviderConfig(next);
      if (statusRequestRef.current === requestId) {
        setAiProviderStatus(status);
        setAiProviderStatusError(null);
      }
      await refreshSettings();
      setSettingsMessage("AI Provider 설정을 저장했습니다.");
    } catch (configError) {
      if (statusRequestRef.current === requestId) {
        setAiProviderStatus(null);
        setAiProviderStatusError(configError instanceof Error ? configError.message : "AI Provider 설정 저장에 실패했습니다.");
      }
      setSettingsMessage(
        configError instanceof Error
          ? configError.message
          : "AI Provider 설정 저장에 실패했습니다.",
      );
    } finally {
      if (statusRequestRef.current === requestId) setAiProviderStatusLoading(false);
    }
  };

  const storeAiProviderKey = async () => {
    if (!aiProviderKeyInput.trim()) {
      setSettingsMessage("저장할 API key를 입력하세요.");
      return;
    }
    const requestId = ++statusRequestRef.current;
    setAiProviderStatus(null);
    setAiProviderStatusLoading(true);
    setAiProviderStatusError(null);
    try {
      const status = await saveAiProviderKey(aiProviderKeyInput.trim());
      setAiProviderKeyInput("");
      if (statusRequestRef.current === requestId) {
        setAiProviderStatus(status);
        setAiProviderStatusError(null);
      }
      await refreshSettings();
      setSettingsMessage("AI Provider key를 저장했습니다.");
    } catch (keyError) {
      if (statusRequestRef.current === requestId) {
        setAiProviderStatus(null);
        setAiProviderStatusError(keyError instanceof Error ? keyError.message : "API key 저장에 실패했습니다.");
      }
      setSettingsMessage(
        keyError instanceof Error ? keyError.message : "API key 저장에 실패했습니다.",
      );
    } finally { if (statusRequestRef.current === requestId) setAiProviderStatusLoading(false); }
  };

  const removeAiProviderKey = async () => {
    const requestId = ++statusRequestRef.current;
    setAiProviderStatus(null);
    setAiProviderStatusLoading(true);
    setAiProviderStatusError(null);
    try {
      const status = await clearAiProviderKey();
      if (statusRequestRef.current === requestId) {
        setAiProviderStatus(status);
        setAiProviderStatusError(null);
      }
      await refreshSettings();
      setSettingsMessage("저장된 AI Provider key를 삭제했습니다.");
    } catch (keyError) {
      if (statusRequestRef.current === requestId) {
        setAiProviderStatus(null);
        setAiProviderStatusError(keyError instanceof Error ? keyError.message : "API key 삭제에 실패했습니다.");
      }
      setSettingsMessage(
        keyError instanceof Error ? keyError.message : "API key 삭제에 실패했습니다.",
      );
    } finally { if (statusRequestRef.current === requestId) setAiProviderStatusLoading(false); }
  };

  return {
    aiProviderStatus,
    aiProviderStatusLoading,
    aiProviderStatusError,
    refreshAiProviderStatus,
    aiProviderKeyInput,
    setAiProviderKeyInput,
    updateAiProviderConfig,
    storeAiProviderKey,
    removeAiProviderKey,
    isAiProviderDesktopAvailable: isTauri(),
  };
}
