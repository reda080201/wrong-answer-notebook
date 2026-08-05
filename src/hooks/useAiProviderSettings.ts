import { useEffect, useRef, useState } from "react";
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
  refreshSettings: () => Promise<void>;
  setSettingsMessage: (message: string | null) => void;
}

export function useAiProviderSettings({
  aiProvider,
  refreshSettings,
  setSettingsMessage,
}: UseAiProviderSettingsOptions) {
  const [aiProviderStatus, setAiProviderStatus] =
    useState<AiProviderStatus | null>(null);
  const [aiProviderKeyInput, setAiProviderKeyInput] = useState("");
  const statusRequestRef = useRef(0);

  useEffect(() => {
    const requestId = ++statusRequestRef.current;

    void getAiProviderStatus()
      .then((status) => {
        if (statusRequestRef.current === requestId) {
          setAiProviderStatus(status);
        }
      })
      .catch((statusError: unknown) => {
        if (statusRequestRef.current === requestId) {
          setSettingsMessage(
            statusError instanceof Error
              ? statusError.message
              : "AI Provider 상태를 불러오지 못했습니다.",
          );
        }
      });
  }, [aiProvider, setSettingsMessage]);

  const updateAiProviderConfig = async (patch: Partial<AiProviderSettings>) => {
    const requestId = ++statusRequestRef.current;
    const next: AiProviderSettings = {
      ...aiProvider,
      ...patch,
    };
    if (next.type === "manual") next.enabled = false;
    try {
      const status = await saveAiProviderConfig(next);
      if (statusRequestRef.current === requestId) {
        setAiProviderStatus(status);
      }
      await refreshSettings();
      setSettingsMessage("AI Provider 설정을 저장했습니다.");
    } catch (configError) {
      setSettingsMessage(
        configError instanceof Error
          ? configError.message
          : "AI Provider 설정 저장에 실패했습니다.",
      );
    }
  };

  const storeAiProviderKey = async () => {
    if (!aiProviderKeyInput.trim()) {
      setSettingsMessage("저장할 API key를 입력하세요.");
      return;
    }
    const requestId = ++statusRequestRef.current;
    try {
      const status = await saveAiProviderKey(aiProviderKeyInput.trim());
      setAiProviderKeyInput("");
      if (statusRequestRef.current === requestId) {
        setAiProviderStatus(status);
      }
      await refreshSettings();
      setSettingsMessage("AI Provider key를 저장했습니다.");
    } catch (keyError) {
      setSettingsMessage(
        keyError instanceof Error ? keyError.message : "API key 저장에 실패했습니다.",
      );
    }
  };

  const removeAiProviderKey = async () => {
    const requestId = ++statusRequestRef.current;
    try {
      const status = await clearAiProviderKey();
      if (statusRequestRef.current === requestId) {
        setAiProviderStatus(status);
      }
      await refreshSettings();
      setSettingsMessage("저장된 AI Provider key를 삭제했습니다.");
    } catch (keyError) {
      setSettingsMessage(
        keyError instanceof Error ? keyError.message : "API key 삭제에 실패했습니다.",
      );
    }
  };

  return {
    aiProviderStatus,
    aiProviderKeyInput,
    setAiProviderKeyInput,
    updateAiProviderConfig,
    storeAiProviderKey,
    removeAiProviderKey,
    isAiProviderDesktopAvailable: isTauri(),
  };
}
