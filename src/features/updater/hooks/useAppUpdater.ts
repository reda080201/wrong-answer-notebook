import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type { AppSettings } from "../../../types";
import type { AppUpdateState, AvailableUpdate } from "../model/appUpdate";
import { calculateUpdatePercent, classifyUpdaterError, UPDATE_AUTO_CHECK_INTERVAL_MS, UPDATE_STARTUP_DELAY_MS, tauriUpdater, updaterErrorMessage } from "../services/appUpdater";
import { sanitizeReleaseNotes } from "../services/updateNotes";

export function useAppUpdater(settings: AppSettings, patchSettings: (patch: Partial<AppSettings>) => Promise<void>, beforeInstall?: (update: AvailableUpdate) => Promise<boolean>) {
  const [state, setState] = useState<AppUpdateState>({ status: "idle" });
  const updateRef = useRef<AvailableUpdate | null>(null);
  const checkingRef = useRef(false);
  const installingRef = useRef(false);

  const checkForUpdate = useCallback(async (options?: { ignoreSkipped?: boolean }) => {
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
      if (!options?.ignoreSkipped && settings.updatePreferences.skippedVersion === update.latestVersion) { setState({ status: "up_to_date", currentVersion, checkedAt: now }); return { status: "up_to_date" } as const; }
      setState({ status: "available", ...update });
      return { status: "available" } as const;
    } catch (error) {
      const code = classifyUpdaterError(error, "check");
      setState({ status: "error", code, message: updaterErrorMessage(code) });
      return { status: "error", code } as const;
    } finally { checkingRef.current = false; }
  }, [patchSettings, settings, state]);

  const installUpdate = useCallback(async () => {
    const update = updateRef.current;
    if (!update || state.status !== "available" || installingRef.current) return;
    installingRef.current = true;
    if (beforeInstall && !(await beforeInstall(update))) { installingRef.current = false; return; }
    setState({ status: "downloading", latestVersion: update.latestVersion, downloadedBytes: 0 });
    let phase: "download" | "install" = "download";
    try {
      await tauriUpdater.download(update, (progress) => {
        setState((current) => current.status === "downloading" ? { ...current, downloadedBytes: progress.downloadedBytes, totalBytes: progress.totalBytes, percent: calculateUpdatePercent(progress.downloadedBytes, progress.totalBytes) } : current);
      });
      phase = "install";
      setState({ status: "installing", latestVersion: update.latestVersion });
      await tauriUpdater.install(update);
      setState({ status: "restart_required", latestVersion: update.latestVersion });
    } catch (error) {
      const code = classifyUpdaterError(error, phase);
      setState({ status: "error", code, message: updaterErrorMessage(code) });
    } finally { installingRef.current = false; }
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
