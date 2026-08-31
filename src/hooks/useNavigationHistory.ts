import { useCallback, useEffect, useRef } from "react";
import { createNavigationHistory, type NavigationSnapshot } from "../utils/navigationHistory";

interface UseNavigationHistoryOptions {
  snapshot: NavigationSnapshot;
  restore(snapshot: NavigationSnapshot): void;
}

export function useNavigationHistory({ snapshot, restore }: UseNavigationHistoryOptions) {
  const controllerRef = useRef(createNavigationHistory());
  const restoringRef = useRef(false);
  const restoreRef = useRef(restore);
  const snapshotKey = JSON.stringify(snapshot);
  useEffect(() => { restoreRef.current = restore; }, [restore]);
  useEffect(() => {
    if (restoringRef.current) { restoringRef.current = false; return; }
    controllerRef.current.push(snapshot);
    window.history.replaceState({ wrongAnswerNotebook: true }, "");
  }, [snapshot, snapshotKey]);
  const move = useCallback((direction: "back" | "forward") => {
    const next = direction === "back" ? controllerRef.current.back() : controllerRef.current.forward();
    if (!next) return false;
    restoringRef.current = true;
    restoreRef.current(next);
    return true;
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
      const target = event.target as HTMLElement | null;
      if (target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)) return;
      event.preventDefault();
      move(event.key === "ArrowLeft" ? "back" : "forward");
    };
    const onPopState = () => move("back");
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("popstate", onPopState);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("popstate", onPopState); };
  }, [move]);
  return { back: () => move("back"), forward: () => move("forward") };
}
