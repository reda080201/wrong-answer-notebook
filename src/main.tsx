import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { invoke, isTauri } from "@tauri-apps/api/core";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { AppDialogProvider } from "./shared/ui/AppDialogProvider";
import { getRequestedStorageMode, initializeStorageBackend } from "./services/storageBackend";
import "./index.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "katex/dist/katex.min.css";

const root = createRoot(document.getElementById("root")!);

function StorageConnectionFailure({ message }: { message: string }) {
  return <main className="storage-connection-failure" role="alert"><section className="storage-connection-failure__surface"><h1>데스크톱 저장소 연결 실패</h1><p>공유 미리보기는 데스크톱 앱과 같은 저장소에만 연결합니다. 데이터 보호를 위해 격리 브라우저 저장소로 전환하지 않았습니다.</p><p className="storage-connection-failure__reason">{message}</p><button type="button" onClick={() => window.location.reload()}>다시 시도</button></section></main>;
}

async function boot(): Promise<void> {
  if (getRequestedStorageMode() === "desktop-shared" && window.location.hostname === "localhost") {
    const redirected = new URL(window.location.href);
    redirected.hostname = "127.0.0.1";
    window.location.replace(redirected.toString());
    return;
  }
  const storage = await initializeStorageBackend();
  if (!storage.ready) {
    root.render(<StorageConnectionFailure message={storage.error ?? "저장소를 초기화하지 못했습니다."} />);
    return;
  }
  root.render(<StrictMode><AppErrorBoundary><AppDialogProvider><App /></AppDialogProvider></AppErrorBoundary></StrictMode>);
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    if (isTauri()) void invoke("report_frontend_ready").catch(() => undefined);
  }));
}

void boot();
