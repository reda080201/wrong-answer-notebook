import { isTauri } from "@tauri-apps/api/core";

const destinations = new Set([
  "https://chatgpt.com/",
  "https://github.com/reda080201/wrong-answer-notebook/releases",
]);

export async function openExternalUrl(url: string): Promise<void> {
  if (!destinations.has(url)) throw new Error("허용되지 않은 외부 주소입니다.");
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }
  // noopener features cause Chromium to return null even when the tab opens.
  const opened = window.open(url, "_blank");
  if (!opened) throw new Error("창을 열지 못했습니다. 주소를 복사해 브라우저에서 열어 주세요.");
  opened.opener = null;
}
