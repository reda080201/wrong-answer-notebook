import { useCallback, useEffect, useState } from "react";
import type { ThemeMode } from "../types";
import { writeUiStorageValue } from "../services/uiStorage";

const STORAGE_KEY = "wrong-answer-theme";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(mode: ThemeMode) {
  const resolved = mode === "system" ? getSystemTheme() : mode;
  document.documentElement.setAttribute("data-theme", resolved);
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    return saved === "light" || saved === "dark" || saved === "system"
      ? saved
      : "dark";
  });

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    writeUiStorageValue(STORAGE_KEY, mode);
    applyTheme(mode);
  }, []);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return { theme, setTheme };
}
