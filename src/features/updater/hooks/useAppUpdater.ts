import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type { AppSettings } from "../../../types";
import type { AppUpdateState, AvailableUpdate } from "../model/appUpdate";
import { UPDATE_AUTO_CHECK_INTERVAL_MS, UPDATE_STARTUP_DELAY_MS, tauriUpdater } from "../services/appUpdater";
import { sanitizeReleaseNotes } from "../services/updateNotes";

export function useAppUpdater(settings: AppSettings, patchSettings: (patch: Partial<AppSettings>) => Promise<void>, beforeInstall?: () => Promise<boolean>) {
  const [state, setState] = useState<AppUpdateState>({ status: "idle" });
  const updateRef = useRef<AvailableUpdate | null>(null);
  const checkingRef = useRef(false);

  const checkForUpdate = useCallback(async () => {
    if (checkingRef.current) return state;
    checkingRef.current = true;
    setState({ status: "checking" });
    try {
      const now = new Date().toISOString();
      if (!isTauri()) {
        setState({ status: "offline", message: "자동 업데이트는 설치된 데스크톱 앱에서 사용할 수 있습니다.", checkedAt: now });
        return { status: "offline" } as const;
      }
      const currentVersion = await tauriUpdater.getCurrentVersion();
      const update = await tauriUpdater.check();
      await patchSettings({ updatePreferences: { ...settings.updatePreferences, lastCheckedAt: now } });
      if (!update) { setState({ status: "up_to_date", currentVersion, checkedAt: now }); return { status: "up_to_date" } as const; }
      update.notes = sanitizeReleaseNotes(update.notes);
      updateRef.current = update;
      if (settings.updatePreferences.skippedVersion === update.latestVersion) { setState({ status: "up_to_date", currentVersion, checkedAt: now }); return { status: "up_to_date" } as const; }
      setState({ status: "available", ...update });
      return { status: "available" } as const;
    } catch (error) {
      const message = error instanceof Error ? error.message : "업데이트 확인에 실패했습니다.";
      setState({ status: "offline", message: "업데이트 서버에 연결하지 못했습니다. 현재 버전은 계속 사용할 수 있습니다.", checkedAt: new Date().toISOString() });
      void message;
      return { status: "offline" } as const;
    } finally { checkingRef.current = false; }
  }, [patchSettings, settings, state]);

  const installUpdate = useCallback(async () => {
    const update = updateRef.current;
    if (!update || state.status !== "available") return;
    if (beforeInstall && !(await beforeInstall())) return;
    setState({ status: "downloading", latestVersion: update.latestVersion, downloadedBytes: 0 });
    try {
      await tauriUpdater.downloadAndInstall(update, (progress) => {
        setState((current) => current.status === "downloading" ? { ...current, downloadedBytes: progress.downloadedBytes, totalBytes: progress.totalBytes, percent: progress.totalBytes ? Math.round(progress.downloadedBytes / progress.totalBytes * 100) : undefined } : current);
      });
      setState({ status: "restart_required", latestVersion: update.latestVersion });
    } catch { setState({ status: "error", code: "download_failed", message: "업데이트 다운로드를 완료하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요." }); }
  }, [beforeInstall, state.status]);

  const restart = useCallback(async () => { if (state.status === "restart_required") await tauriUpdater.restart(); }, [state.status]);
  useEffect(() => {
    if (!settings.updatePreferences.autoCheckEnabled) return;
    const last = settings.updatePreferences.lastCheckedAt ? Date.parse(settings.updatePreferences.lastCheckedAt) : 0;
    const timer = window.setTimeout(() => { if (Date.now() - last >= UPDATE_AUTO_CHECK_INTERVAL_MS) void checkForUpdate(); }, UPDATE_STARTUP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [checkForUpdate, settings.updatePreferences]);
  return { state, checkForUpdate, installUpdate, restart };
}
