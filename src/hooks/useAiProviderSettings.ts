import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  clearAiProviderKey,
  getAiProviderStatus,
  saveAiProviderConfig,
  saveAiProviderKey,
  testAiProviderConnection,
} from "../api";
import type { AiProviderSettings, AiProviderStatus, AiProviderType } from "../types";

interface UseAiProviderSettingsOptions {
  aiProvider: AiProviderSettings;
  refreshSettings: () => Promise<boolean>;
  setSettingsMessage: (message: string | null) => void;
}

function effectiveProvider(config: AiProviderSettings): AiProviderType {
  const provider = config.provider ?? config.type;
  if (provider === "gemini-flash-lite" || provider === "gemini-3.5-flash") {
    return "google-gemini";
  }
  return provider === "manual" ? "openai-compatible" : provider;
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
  const configQueueRef = useRef<Promise<void>>(Promise.resolve());
  const desiredConfigRef = useRef<AiProviderSettings>(aiProvider);
  const pendingConfigWritesRef = useRef(0);
  const requestedConfigGenerationRef = useRef(0);
  const savedConfigGenerationRef = useRef(0);
  const latestConfigErrorRef = useRef<Error | null>(null);
  const operationCountRef = useRef(0);
  const [operationPending, setOperationPending] = useState(false);

  const beginOperation = useCallback(() => {
    operationCountRef.current += 1;
    setOperationPending(true);
  }, []);

  const finishOperation = useCallback(() => {
    operationCountRef.current = Math.max(0, operationCountRef.current - 1);
    if (operationCountRef.current === 0) setOperationPending(false);
  }, []);

  const enqueueOperation = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const queued = configQueueRef.current.then(operation, operation);
    configQueueRef.current = queued.then(() => undefined, () => undefined);
    return queued;
  }, []);

  useEffect(() => {
    if (pendingConfigWritesRef.current === 0) desiredConfigRef.current = aiProvider;
  }, [aiProvider]);

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

  const updateAiProviderConfig = useCallback((patch: Partial<AiProviderSettings>) => {
    const next: AiProviderSettings = { ...desiredConfigRef.current, ...patch };
    if (next.type === "manual") next.enabled = false;
    desiredConfigRef.current = next;
    pendingConfigWritesRef.current += 1;
    const generation = ++requestedConfigGenerationRef.current;
    const requestId = ++statusRequestRef.current;
    beginOperation();
    const write = async () => {
      setAiProviderStatus(null);
      setAiProviderStatusLoading(true);
      setAiProviderStatusError(null);
      try {
        const status = await saveAiProviderConfig(next);
        savedConfigGenerationRef.current = Math.max(savedConfigGenerationRef.current, generation);
        latestConfigErrorRef.current = null;
        if (statusRequestRef.current === requestId) {
          setAiProviderStatus(status);
          setAiProviderStatusError(null);
        }
        await refreshSettings();
        if (statusRequestRef.current === requestId) setSettingsMessage("AI Provider 설정을 저장했습니다.");
        return true;
      } catch (configError) {
        latestConfigErrorRef.current = configError instanceof Error
          ? configError
          : new Error("AI Provider 설정 저장에 실패했습니다.");
        if (statusRequestRef.current === requestId) {
          const message = configError instanceof Error ? configError.message : "AI Provider 설정 저장에 실패했습니다.";
          setAiProviderStatus(null);
          setAiProviderStatusError(message);
          setSettingsMessage(message);
        }
        return false;
      } finally {
        pendingConfigWritesRef.current -= 1;
        finishOperation();
        if (statusRequestRef.current === requestId && pendingConfigWritesRef.current === 0) setAiProviderStatusLoading(false);
      }
    };
    return enqueueOperation(write);
  }, [beginOperation, enqueueOperation, finishOperation, refreshSettings, setSettingsMessage]);

  const flushAiProviderConfig = useCallback(async () => {
    for (;;) {
      const targetGeneration = requestedConfigGenerationRef.current;
      const tail = configQueueRef.current;
      await tail;
      if (tail !== configQueueRef.current || targetGeneration !== requestedConfigGenerationRef.current) {
        continue;
      }
      if (savedConfigGenerationRef.current < targetGeneration) {
        throw latestConfigErrorRef.current ?? new Error("AI Provider 설정을 저장하지 못했습니다.");
      }
      return;
    }
  }, []);

  const storeAiProviderKey = useCallback(async () => {
    if (!aiProviderKeyInput.trim()) {
      setSettingsMessage("저장할 API key를 입력하세요.");
      return;
    }
    const apiKey = aiProviderKeyInput.trim();
    const expectedProvider = effectiveProvider(desiredConfigRef.current);
    const requiredGeneration = requestedConfigGenerationRef.current;
    beginOperation();
    await enqueueOperation(async () => {
      const requestId = ++statusRequestRef.current;
      setAiProviderStatus(null);
      setAiProviderStatusLoading(true);
      setAiProviderStatusError(null);
      try {
        if (savedConfigGenerationRef.current < requiredGeneration) {
          throw latestConfigErrorRef.current ?? new Error("AI Provider 설정을 먼저 저장하지 못했습니다.");
        }
        const status = await saveAiProviderKey(apiKey, expectedProvider);
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
        setSettingsMessage(keyError instanceof Error ? keyError.message : "API key 저장에 실패했습니다.");
      } finally {
        finishOperation();
        if (statusRequestRef.current === requestId) setAiProviderStatusLoading(false);
      }
    });
  }, [aiProviderKeyInput, beginOperation, enqueueOperation, finishOperation, refreshSettings, setSettingsMessage]);

  const removeAiProviderKey = useCallback(async () => {
    const expectedProvider = effectiveProvider(desiredConfigRef.current);
    const requiredGeneration = requestedConfigGenerationRef.current;
    beginOperation();
    await enqueueOperation(async () => {
      const requestId = ++statusRequestRef.current;
      setAiProviderStatus(null);
      setAiProviderStatusLoading(true);
      setAiProviderStatusError(null);
      try {
        if (savedConfigGenerationRef.current < requiredGeneration) {
          throw latestConfigErrorRef.current ?? new Error("AI Provider 설정을 먼저 저장하지 못했습니다.");
        }
        const status = await clearAiProviderKey(expectedProvider);
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
        setSettingsMessage(keyError instanceof Error ? keyError.message : "API key 삭제에 실패했습니다.");
      } finally {
        finishOperation();
        if (statusRequestRef.current === requestId) setAiProviderStatusLoading(false);
      }
    });
  }, [beginOperation, enqueueOperation, finishOperation, refreshSettings, setSettingsMessage]);

  const testAiProvider = useCallback(async () => {
    const requiredGeneration = requestedConfigGenerationRef.current;
    beginOperation();
    await enqueueOperation(async () => {
      setAiProviderStatusLoading(true);
      setAiProviderStatusError(null);
      try {
        if (savedConfigGenerationRef.current < requiredGeneration) {
          throw latestConfigErrorRef.current ?? new Error("AI Provider 설정을 먼저 저장하지 못했습니다.");
        }
        const status = await testAiProviderConnection();
        setAiProviderStatus(status);
        setSettingsMessage(status.available ? "AI provider 연결 테스트에 성공했습니다." : status.message ?? "AI provider를 사용할 수 없습니다.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI provider 연결 테스트에 실패했습니다.";
        setAiProviderStatusError(message);
        setSettingsMessage(message);
      } finally {
        finishOperation();
        setAiProviderStatusLoading(false);
      }
    });
  }, [beginOperation, enqueueOperation, finishOperation, setSettingsMessage]);

  return useMemo(() => ({
    aiProviderStatus,
    aiProviderStatusLoading,
    aiProviderStatusError,
    refreshAiProviderStatus,
    aiProviderKeyInput,
    setAiProviderKeyInput,
    operationPending,
    updateAiProviderConfig,
    flushAiProviderConfig,
    storeAiProviderKey,
    removeAiProviderKey,
    testAiProvider,
    isAiProviderDesktopAvailable: isTauri(),
  }), [
    aiProviderStatus,
    aiProviderStatusLoading,
    aiProviderStatusError,
    refreshAiProviderStatus,
    aiProviderKeyInput,
    operationPending,
    updateAiProviderConfig,
    flushAiProviderConfig,
    storeAiProviderKey,
    removeAiProviderKey,
    testAiProvider,
  ]);
}
