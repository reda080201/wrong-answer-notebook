import { isTauri } from "@tauri-apps/api/core";
import type { AvailableUpdate } from "../model/appUpdate";

export const UPDATE_STARTUP_DELAY_MS = 8_000;
export const UPDATE_AUTO_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
export const GITHUB_RELEASES_URL = "https://github.com/reda080201/wrong-answer-notebook/releases";

export interface UpdateProgress { event: "Started" | "Progress" | "Finished"; downloadedBytes: number; totalBytes?: number; }
export interface AppUpdaterAdapter {
  getCurrentVersion(): Promise<string>;
  check(): Promise<AvailableUpdate | null>;
  download(update: AvailableUpdate, onProgress: (progress: UpdateProgress) => void): Promise<void>;
  install(update: AvailableUpdate): Promise<void>;
  restart(): Promise<void>;
}

let activeUpdate: import("@tauri-apps/plugin-updater").Update | null = null;
let downloadedBytes = 0;
let activeTotalBytes: number | undefined;

export const tauriUpdater: AppUpdaterAdapter = {
  async getCurrentVersion() {
    if (!isTauri()) return "브라우저";
    const { getVersion } = await import("@tauri-apps/api/app");
    return getVersion();
  },
  async check() {
    if (!isTauri()) return null;
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) return null;
    activeUpdate = update;
    return { currentVersion: update.currentVersion, latestVersion: update.version, notes: update.body, publishedAt: update.date };
  },
  async download(update, onProgress) {
    if (!activeUpdate) throw new Error("업데이트 세션이 없습니다.");
    downloadedBytes = 0;
    activeTotalBytes = undefined;
    await activeUpdate.download((event) => {
      if (event.event === "Started") {
        activeTotalBytes = typeof event.data.contentLength === "number" && event.data.contentLength > 0 ? event.data.contentLength : undefined;
        onProgress({ event: "Started", downloadedBytes: 0, totalBytes: activeTotalBytes });
      }
      if (event.event === "Progress") {
        downloadedBytes += event.data.chunkLength;
        onProgress({ event: "Progress", downloadedBytes, totalBytes: activeTotalBytes });
      }
      if (event.event === "Finished") onProgress({ event: "Finished", downloadedBytes, totalBytes: activeTotalBytes });
    });
    void update;
  },
  async install(update) {
    if (!activeUpdate) throw new Error("업데이트 세션이 없습니다.");
    await activeUpdate.install();
    activeUpdate = null;
    void update;
  },
  async restart() {
    if (!isTauri()) return;
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  },
};

export function isUpdaterSupported(): boolean { return isTauri(); }

export function calculateUpdatePercent(downloadedBytes: number, totalBytes?: number): number | undefined {
  if (!totalBytes || totalBytes <= 0) return undefined;
  return Math.min(100, Math.max(0, Math.round((downloadedBytes / totalBytes) * 100)));
}

export function classifyUpdaterError(error: unknown, phase: "check" | "download" | "install"): import("../model/appUpdate").AppUpdateErrorCode {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (/signature|signing|public key|invalid signature/.test(message)) return "signature_failed";
  if (/manifest|latest\.json|json|version|schema/.test(message)) return "invalid_manifest";
  if (/unsupported|platform|architecture|target/.test(message)) return "unsupported_platform";
  if (phase === "check") return "check_failed";
  if (phase === "install") return "install_failed";
  return "download_failed";
}

export function updaterErrorMessage(code: import("../model/appUpdate").AppUpdateErrorCode): string {
  switch (code) {
    case "signature_failed": return "업데이트 파일의 서명을 확인하지 못해 설치를 중단했습니다.";
    case "invalid_manifest": return "업데이트 정보가 올바르지 않아 설치하지 않았습니다.";
    case "unsupported_platform": return "현재 운영체제에서 지원하지 않는 업데이트입니다.";
    case "install_failed": return "업데이트 설치를 완료하지 못했습니다. 현재 데이터는 변경되지 않았습니다.";
    case "download_failed": return "업데이트 다운로드가 중단되었습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.";
    default: return "업데이트 서버에 연결하지 못했습니다. 현재 버전은 계속 사용할 수 있습니다.";
  }
}
