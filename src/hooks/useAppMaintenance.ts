import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { cleanupStaleImportAssetSessions, createAutoBackup } from "../api";
import type { AppSettings } from "../types";
import { loadImportWorkspaceDraft } from "../features/import-workspace/hooks/useImportWorkspaceAutosave";

interface UseAppMaintenanceOptions {
  settings: AppSettings;
  patchSettings(patch: Partial<AppSettings>): Promise<void>;
  report(message: string): void;
  flushEntries(): Promise<void>;
  flushSettings(): Promise<void>;
  flushGeneratedExams(): Promise<void>;
  setEntriesMaintenanceBlocked(blocked: boolean): void;
  setSettingsMaintenanceBlocked(blocked: boolean): void;
  setGeneratedExamsMaintenanceBlocked(blocked: boolean): void;
}

export function useAppMaintenance({
  settings,
  patchSettings,
  report,
  flushEntries,
  flushSettings,
  flushGeneratedExams,
  setEntriesMaintenanceBlocked,
  setSettingsMaintenanceBlocked,
  setGeneratedExamsMaintenanceBlocked,
}: UseAppMaintenanceOptions) {
  useEffect(() => {
    if (!isTauri()) return;
    const draft = loadImportWorkspaceDraft();
    const protectedSessionIds = draft?.assetSession?.mode === "tauri-staged"
      ? [draft.assetSession.id]
      : [];
    void cleanupStaleImportAssetSessions(protectedSessionIds).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isTauri() || !settings.autoBackup.enabled) return;
    const lastBackup = settings.autoBackup.lastBackupAt
      ? new Date(settings.autoBackup.lastBackupAt)
      : null;
    if (lastBackup?.toDateString() === new Date().toDateString()) return;

    let cancelled = false;
    void (async () => {
      await Promise.all([flushEntries(), flushSettings(), flushGeneratedExams()]);
      setEntriesMaintenanceBlocked(true);
      setSettingsMaintenanceBlocked(true);
      setGeneratedExamsMaintenanceBlocked(true);
      try {
        await createAutoBackup();
      } finally {
        setEntriesMaintenanceBlocked(false);
        setSettingsMaintenanceBlocked(false);
        setGeneratedExamsMaintenanceBlocked(false);
      }
      if (cancelled) return;
      await patchSettings({
        autoBackup: {
          ...settings.autoBackup,
          lastBackupAt: new Date().toISOString(),
        },
      });
    })().catch(() => {
      if (!cancelled) report("자동 백업에 실패했습니다. 설정에서 수동 백업을 실행해 주세요.");
    });
    return () => { cancelled = true; };
  }, [flushEntries, flushGeneratedExams, flushSettings, patchSettings, report, setEntriesMaintenanceBlocked, setGeneratedExamsMaintenanceBlocked, setSettingsMaintenanceBlocked, settings.autoBackup]);
}
