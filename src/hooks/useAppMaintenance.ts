import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { cleanupStaleImportAssetSessions, createAutoBackup } from "../api";
import type { AppSettings } from "../types";
import { loadImportWorkspaceDraft } from "../features/import-workspace/hooks/useImportWorkspaceAutosave";

interface UseAppMaintenanceOptions {
  settings: AppSettings;
  patchSettings(patch: Partial<AppSettings>): Promise<void>;
  report(message: string): void;
  runMaintenanceOperation<T>(task: () => Promise<T>): Promise<T>;
}

export function useAppMaintenance({
  settings,
  patchSettings,
  report,
  runMaintenanceOperation,
}: UseAppMaintenanceOptions) {
  useEffect(() => {
    if (!isTauri()) return;
    void loadImportWorkspaceDraft().then((draft) => {
      const protectedSessionIds = draft?.assetSession?.mode === "tauri-staged"
        ? [draft.assetSession.id]
        : [];
      return cleanupStaleImportAssetSessions(protectedSessionIds);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isTauri() || !settings.autoBackup.enabled) return;
    const lastBackup = settings.autoBackup.lastBackupAt
      ? new Date(settings.autoBackup.lastBackupAt)
      : null;
    if (lastBackup?.toDateString() === new Date().toDateString()) return;

    let cancelled = false;
    void (async () => {
      await runMaintenanceOperation(() => createAutoBackup());
      if (cancelled) return;
      try {
        await patchSettings({
          autoBackup: {
            ...settings.autoBackup,
            lastBackupAt: new Date().toISOString(),
          },
        });
      } catch {
        if (!cancelled) report("자동 백업은 완료됐지만 마지막 백업 시각을 저장하지 못했습니다.");
      }
    })().catch(() => {
      if (!cancelled) report("자동 백업에 실패했습니다. 설정에서 수동 백업을 실행해 주세요.");
    });
    return () => { cancelled = true; };
  }, [patchSettings, report, runMaintenanceOperation, settings.autoBackup]);
}
