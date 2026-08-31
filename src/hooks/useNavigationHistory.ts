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
  const scrollTargetsRef = useRef(new Map<string, HTMLElement>());
  const withScroll = useCallback((candidate: NavigationSnapshot): NavigationSnapshot => ({
    ...candidate,
    scrollTops: Object.fromEntries([...scrollTargetsRef.current.entries()].map(([key, element]) => [key, element.scrollTop])),
  }), []);
  const snapshotKey = JSON.stringify(withScroll(snapshot));
  useEffect(() => { restoreRef.current = restore; }, [restore]);
  useEffect(() => {
    if (restoringRef.current) { restoringRef.current = false; return; }
    controllerRef.current.push(withScroll(snapshot));
    window.history.replaceState({ wrongAnswerNotebook: true }, "");
  }, [snapshotKey, withScroll]);
  const move = useCallback((direction: "back" | "forward") => {
    const next = direction === "back" ? controllerRef.current.back() : controllerRef.current.forward();
    if (!next) return false;
    restoringRef.current = true;
    restoreRef.current(next);
    requestAnimationFrame(() => {
      for (const [key, value] of Object.entries(next.scrollTops ?? {})) {
        const target = scrollTargetsRef.current.get(key);
        if (target) target.scrollTop = value;
      }
    });
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
  const registerScrollRestoration = useCallback((key: string, element: HTMLElement | null) => {
    if (element) scrollTargetsRef.current.set(key, element);
    else scrollTargetsRef.current.delete(key);
  }, []);
  return { back: () => move("back"), forward: () => move("forward"), registerScrollRestoration };
}
