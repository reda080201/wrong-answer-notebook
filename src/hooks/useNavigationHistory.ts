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
  const scrollCleanupRef = useRef(new Map<string, () => void>());
  const pendingScrollTopsRef = useRef<Record<string, number>>({});
  const snapshotRef = useRef(snapshot);
  const initializedRef = useRef(false);
  const withScroll = useCallback((candidate: NavigationSnapshot): NavigationSnapshot => ({
    ...candidate,
    scrollTops: Object.fromEntries([...scrollTargetsRef.current.entries()].map(([key, element]) => [key, element.scrollTop])),
  }), []);
  const snapshotKey = JSON.stringify(withScroll(snapshot));
  const restoreScrollTops = useCallback((scrollTops: Record<string, number> | undefined) => {
    if (!scrollTops) return;
    pendingScrollTopsRef.current = { ...pendingScrollTopsRef.current, ...scrollTops };
    requestAnimationFrame(() => {
      for (const [key, value] of Object.entries(pendingScrollTopsRef.current)) {
        const target = scrollTargetsRef.current.get(key);
        if (!target) continue;
        target.scrollTop = value;
        delete pendingScrollTopsRef.current[key];
      }
    });
  }, []);
  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);
  useEffect(() => { restoreRef.current = restore; }, [restore]);
  useEffect(() => {
    if (restoringRef.current) { restoringRef.current = false; return; }
    const next = withScroll(snapshot);
    const previous = controllerRef.current.current();
    controllerRef.current.push(next);
    if (!initializedRef.current) {
      initializedRef.current = true;
      window.history.replaceState({ wrongAnswerNotebook: true, snapshot: next }, "");
    } else if (!previous || JSON.stringify(previous) !== JSON.stringify(next)) {
      window.history.pushState({ wrongAnswerNotebook: true, snapshot: next }, "");
    }
  }, [snapshotKey, withScroll]);
  const move = useCallback((direction: "back" | "forward") => {
    const next = direction === "back" ? controllerRef.current.back() : controllerRef.current.forward();
    if (!next) return false;
    restoringRef.current = true;
    restoreRef.current(next);
    restoreScrollTops(next.scrollTops);
    return true;
  }, [restoreScrollTops]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
      const target = event.target as HTMLElement | null;
      if (target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)) return;
      event.preventDefault();
      move(event.key === "ArrowLeft" ? "back" : "forward");
    };
    const onPopState = (event: PopStateEvent) => {
      const state = event.state as { wrongAnswerNotebook?: boolean; snapshot?: NavigationSnapshot } | null;
      if (state?.wrongAnswerNotebook && state.snapshot) {
        controllerRef.current.moveTo(state.snapshot);
        restoringRef.current = true;
        restoreRef.current(state.snapshot);
        restoreScrollTops(state.snapshot.scrollTops);
        return;
      }
      // A browser navigation outside this app is owned by the browser. Do not
      // consume an unrelated entry from the in-memory stack.
      return;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("popstate", onPopState);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("popstate", onPopState); };
  }, [move, restoreScrollTops]);
  const registerScrollRestoration = useCallback((key: string, element: HTMLElement | null) => {
    scrollCleanupRef.current.get(key)?.();
    scrollCleanupRef.current.delete(key);
    if (!element) {
      scrollTargetsRef.current.delete(key);
      return;
    }
    scrollTargetsRef.current.set(key, element);
    restoreScrollTops(pendingScrollTopsRef.current);
    const onScroll = () => {
      const current = controllerRef.current.current();
      if (!current) return;
      const next = withScroll(snapshotRef.current);
      controllerRef.current.updateCurrent(next);
      if (window.history.state?.wrongAnswerNotebook) {
        window.history.replaceState({ ...window.history.state, snapshot: next }, "");
      }
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    scrollCleanupRef.current.set(key, () => element.removeEventListener("scroll", onScroll));
  }, [restoreScrollTops, withScroll]);
  useEffect(() => () => {
    for (const cleanup of scrollCleanupRef.current.values()) cleanup();
    scrollCleanupRef.current.clear();
  }, []);
  return { back: () => move("back"), forward: () => move("forward"), registerScrollRestoration };
}
