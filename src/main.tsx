import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { invoke, isTauri } from "@tauri-apps/api/core";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { AppDialogProvider } from "./shared/ui/AppDialogProvider";
import "./index.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "katex/dist/katex.min.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <AppDialogProvider>
        <App />
      </AppDialogProvider>
    </AppErrorBoundary>
  </StrictMode>,
);

window.requestAnimationFrame(() => {
  window.requestAnimationFrame(() => {
    if (isTauri()) void invoke("report_frontend_ready").catch(() => undefined);
  });
});
