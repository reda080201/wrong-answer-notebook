import { invoke, isTauri } from "@tauri-apps/api/core";
import type { WrongAnswerEntry } from "../../types";
import type { ImportAssetSessionManifest } from "../../features/import-workspace/model/importWorkspace";
import { normalizeImportImageKey } from "../../utils/importImageReferences";
import { getStorageBackendKind, proxyRequest } from "../storageBackend";

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

export interface ImportAssetStageOptions {
  signal?: AbortSignal;
  onProgress?: (current: number, total: number) => void;
}

export async function stageImportAssetFiles(files: File[], options: ImportAssetStageOptions = {}): Promise<ImportAssetStageResult | null> {
  const backendKind = getStorageBackendKind();
  if (backendKind === "isolated-browser" || !files.length) return null;
  const sessionId = backendKind === "tauri"
    ? await invoke<string>("create_import_asset_session")
    : (await proxyRequest<{ sessionId: string }>("/v1/import-sessions", { method: "POST" })).sessionId;
  const sourceToStaged: Record<string, string> = {};
  const assets: ImportAssetStageResult["assets"] = [];
  try {
    for (const file of files) {
      if (options.signal?.aborted) throw new DOMException("가져오기를 취소했습니다.", "AbortError");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = backendKind === "tauri"
        ? await invoke<{ stagedFilename: string; sha256: string }>("stage_import_asset_bytes", {
            sessionId, sourceName: file.name, bytes, mime: file.type || undefined,
          })
        : await proxyRequest<{ stagedFilename: string; sha256: string }>(`/v1/import-sessions/${sessionId}/assets`, {
            method: "POST",
            body: JSON.stringify({ sourceName: file.name, bytesBase64: bytesToBase64(bytes), mime: file.type || undefined }),
          });
      sourceToStaged[normalizeImportImageKey(file.name)] = result.stagedFilename;
      assets.push({
        sourceName: file.name,
        stagedFilename: result.stagedFilename,
        size: file.size,
        sha256: result.sha256,
        lastModified: file.lastModified,
      });
      options.onProgress?.(assets.length, files.length);
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
  if (getStorageBackendKind() === "desktop-proxy") {
    return proxyRequest<ImportAssetSessionValidationResult>("/v1/import-sessions/validate", { method: "POST", body: JSON.stringify(manifest) });
  }
  if (!isTauri()) return { valid: false, missingFiles: [], mismatchedFiles: ["데스크톱 자산 session"] };
  return invoke<ImportAssetSessionValidationResult>("validate_import_asset_session", { manifest });
}

export async function cleanupStaleImportAssetSessions(protectedSessionIds: string[] = []): Promise<number> {
  if (!isTauri()) return 0;
  return invoke<number>("cleanup_stale_import_asset_sessions", { protectedSessionIds });
}

export async function commitImportAssetSession(sessionId: string): Promise<string[]> {
  if (getStorageBackendKind() === "desktop-proxy") {
    const result = await proxyRequest<{ filenames: string[] }>(`/v1/import-sessions/${sessionId}/commit`, { method: "POST" });
    return result.filenames;
  }
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
  if (getStorageBackendKind() === "desktop-proxy") {
    const result = await proxyRequest<{ filenames: string[] }>(`/v1/import-sessions/${sessionId}/entry`, {
      method: "POST", body: JSON.stringify({ entryId, expectedUpdatedAt, entry }),
    });
    return result.filenames;
  }
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

export async function commitImportAssetSessionEntries(
  sessionId: string,
  entries: WrongAnswerEntry[],
): Promise<string[]> {
  if (getStorageBackendKind() === "desktop-proxy") {
    const result = await proxyRequest<{ filenames: string[] }>(`/v1/import-sessions/${sessionId}/entries`, {
      method: "POST", body: JSON.stringify(entries),
    });
    return result.filenames;
  }
  if (!isTauri()) {
    throw new Error("staged 가져오기 자산은 데스크톱 앱에서만 저장할 수 있습니다.");
  }
  const result = await invoke<{ filenames: string[] }>("commit_import_asset_session_entries", {
    sessionId,
    entries,
  });
  return result.filenames;
}

export async function discardImportAssetSession(sessionId: string): Promise<void> {
  if (getStorageBackendKind() === "desktop-proxy") {
    await proxyRequest(`/v1/import-sessions/${sessionId}`, { method: "DELETE" });
    return;
  }
  if (isTauri()) await invoke("discard_import_asset_session", { sessionId });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
