import { invoke, isTauri } from "@tauri-apps/api/core";
import type { WrongAnswerEntry } from "../../types";
import type { ImportAssetSessionManifest } from "../../features/import-workspace/model/importWorkspace";
import { normalizeImportImageKey } from "../../utils/importImageReferences";

export interface ImportAssetStageResult {
  sessionId: string;
  sourceToStaged: Record<string, string>;
  assets: Array<{
    sourceName: string;
    stagedFilename: string;
    size: number;
    sha256: string;
    lastModified: number;
  }>;
}

export async function stageImportAssetFiles(files: File[]): Promise<ImportAssetStageResult | null> {
  if (!isTauri() || !files.length) return null;
  const sessionId = await invoke<string>("create_import_asset_session");
  const sourceToStaged: Record<string, string> = {};
  const assets: ImportAssetStageResult["assets"] = [];
  try {
    for (const file of files) {
      const result = await invoke<{ stagedFilename: string; sha256: string }>("stage_import_asset_bytes", {
        sessionId,
        sourceName: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        mime: file.type || undefined,
      });
      sourceToStaged[normalizeImportImageKey(file.name)] = result.stagedFilename;
      assets.push({
        sourceName: file.name,
        stagedFilename: result.stagedFilename,
        size: file.size,
        sha256: result.sha256,
        lastModified: file.lastModified,
      });
    }
    return { sessionId, sourceToStaged, assets };
  } catch (error) {
    await discardImportAssetSession(sessionId).catch(() => undefined);
    throw error;
  }
}

export interface ImportAssetSessionValidationResult {
  valid: boolean;
  missingFiles: string[];
  mismatchedFiles: string[];
}

export async function validateImportAssetSession(
  manifest: ImportAssetSessionManifest,
): Promise<ImportAssetSessionValidationResult> {
  if (manifest.mode !== "tauri-staged") return { valid: true, missingFiles: [], mismatchedFiles: [] };
  if (!isTauri()) return { valid: false, missingFiles: [], mismatchedFiles: ["데스크톱 자산 session"] };
  return invoke<ImportAssetSessionValidationResult>("validate_import_asset_session", { manifest });
}

export async function cleanupStaleImportAssetSessions(protectedSessionIds: string[] = []): Promise<number> {
  if (!isTauri()) return 0;
  return invoke<number>("cleanup_stale_import_asset_sessions", { protectedSessionIds });
}

export async function commitImportAssetSession(sessionId: string): Promise<string[]> {
  if (!isTauri()) return [];
  const result = await invoke<{ filenames: string[] }>("commit_import_asset_session", { sessionId });
  return result.filenames;
}

export async function commitImportAssetSessionEntry(
  sessionId: string,
  entryId: string,
  expectedUpdatedAt: string,
  entry: WrongAnswerEntry,
): Promise<string[]> {
  if (!isTauri()) {
    throw new Error("staged 가져오기 자산은 데스크톱 앱에서만 저장할 수 있습니다.");
  }
  const result = await invoke<{ filenames: string[] }>("commit_import_asset_session_entry", {
    sessionId,
    entryId,
    expectedUpdatedAt,
    entry,
  });
  return result.filenames;
}

export async function discardImportAssetSession(sessionId: string): Promise<void> {
  if (isTauri()) await invoke("discard_import_asset_session", { sessionId });
}
