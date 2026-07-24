import { isTauri } from "@tauri-apps/api/core";
import type { AvailableUpdate } from "../model/appUpdate";

export const UPDATE_STARTUP_DELAY_MS = 8_000;
export const UPDATE_AUTO_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
export const GITHUB_RELEASES_URL = "https://github.com/reda080201/wrong-answer-notebook/releases";

export interface UpdateProgress { event: "Started" | "Progress" | "Finished"; downloadedBytes: number; totalBytes?: number; }
export interface AppUpdaterAdapter {
  getCurrentVersion(): Promise<string>;
  check(): Promise<AvailableUpdate | null>;
  downloadAndInstall(update: AvailableUpdate, onProgress: (progress: UpdateProgress) => void): Promise<void>;
  restart(): Promise<void>;
}

let activeUpdate: import("@tauri-apps/plugin-updater").Update | null = null;
let downloadedBytes = 0;

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
  async downloadAndInstall(update, onProgress) {
    if (!activeUpdate) throw new Error("업데이트 세션이 없습니다.");
    downloadedBytes = 0;
    await activeUpdate.downloadAndInstall((event) => {
      if (event.event === "Started") onProgress({ event: "Started", downloadedBytes: 0, totalBytes: event.data.contentLength });
      if (event.event === "Progress") { downloadedBytes += event.data.chunkLength; onProgress({ event: "Progress", downloadedBytes }); }
      if (event.event === "Finished") onProgress({ event: "Finished", downloadedBytes });
    });
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

