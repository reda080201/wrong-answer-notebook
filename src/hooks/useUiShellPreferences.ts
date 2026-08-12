import { useCallback, useState } from "react";

export const APP_SIDEBAR_COLLAPSED_KEY = "wrong-answer-app-sidebar-collapsed";
export const ENTRY_PANE_COLLAPSED_KEY = "wrong-answer-entry-pane-collapsed";
export const ENTRY_PANE_WIDTH_KEY = "wrong-answer-entry-pane-width";
export const ENTRY_PANE_MIN_WIDTH = 240;
export const ENTRY_PANE_MAX_WIDTH = 460;
export const ENTRY_PANE_DEFAULT_WIDTH = 300;

export interface UiShellPreferences {
  appSidebarCollapsed: boolean;
  entryPaneCollapsed: boolean;
  entryPaneWidth: number;
}

function readBoolean(key: string): boolean {
  return typeof localStorage !== "undefined" && localStorage.getItem(key) === "true";
}

export function clampEntryPaneWidth(value: number): number {
  if (!Number.isFinite(value)) return ENTRY_PANE_DEFAULT_WIDTH;
  return Math.min(ENTRY_PANE_MAX_WIDTH, Math.max(ENTRY_PANE_MIN_WIDTH, Math.round(value)));
}

function readWidth(): number {
  if (typeof localStorage === "undefined") return ENTRY_PANE_DEFAULT_WIDTH;
  return clampEntryPaneWidth(Number(localStorage.getItem(ENTRY_PANE_WIDTH_KEY)));
}

export function useUiShellPreferences() {
  const [preferences, setPreferences] = useState<UiShellPreferences>(() => ({
    appSidebarCollapsed: readBoolean(APP_SIDEBAR_COLLAPSED_KEY),
    entryPaneCollapsed: readBoolean(ENTRY_PANE_COLLAPSED_KEY),
    entryPaneWidth: readWidth(),
  }));

  const setAppSidebarCollapsed = useCallback((collapsed: boolean) => {
    localStorage.setItem(APP_SIDEBAR_COLLAPSED_KEY, String(collapsed));
    setPreferences((current) => ({ ...current, appSidebarCollapsed: collapsed }));
  }, []);
  const setEntryPaneCollapsed = useCallback((collapsed: boolean) => {
    localStorage.setItem(ENTRY_PANE_COLLAPSED_KEY, String(collapsed));
    setPreferences((current) => ({ ...current, entryPaneCollapsed: collapsed }));
  }, []);
  const setEntryPaneWidth = useCallback((width: number) => {
    const next = clampEntryPaneWidth(width);
    localStorage.setItem(ENTRY_PANE_WIDTH_KEY, String(next));
    setPreferences((current) => ({ ...current, entryPaneWidth: next }));
  }, []);

  return { ...preferences, setAppSidebarCollapsed, setEntryPaneCollapsed, setEntryPaneWidth };
}
