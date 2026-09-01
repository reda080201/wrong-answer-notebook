import { useCallback, useEffect, useRef } from "react";

export interface NavigationSnapshot {
  destination: "section" | "learning_hub" | "question_bank" | "library";
  section: string;
  selectedId: string | null;
  search: string;
  subjectFilter: string | null;
  listFilter: string;
  sortKey: string;
  difficultyScoreFilter: string;
  scrollTop?: Record<string, number>;
}

interface Options {
  snapshot: NavigationSnapshot;
  restore(snapshot: NavigationSnapshot): void;
}

const HISTORY_KEY = "wrong-answer-navigation";

/** Browser and Tauri WebView history stays session-only and never touches entries/settings. */
export function useNavigationHistory({ snapshot, restore }: Options) {
  const restoringRef = useRef(false);
  const firstRef = useRef(true);
  const scrollContainers = useRef(new Map<string, HTMLElement>());
  const latestSnapshot = useRef(snapshot);
  latestSnapshot.current = snapshot;

  const withScroll = useCallback((): NavigationSnapshot => ({
    ...latestSnapshot.current,
    scrollTop: Object.fromEntries([...scrollContainers.current.entries()].map(([key, element]) => [key, element.scrollTop])),
  }), []);

  useEffect(() => {
    const next = withScroll();
    if (restoringRef.current) {
      restoringRef.current = false;
      window.history.replaceState({ [HISTORY_KEY]: next }, "");
      return;
    }
    if (firstRef.current) {
      firstRef.current = false;
      window.history.replaceState({ [HISTORY_KEY]: next }, "");
    } else {
      window.history.pushState({ [HISTORY_KEY]: next }, "");
    }
  }, [snapshot, withScroll]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const value = event.state?.[HISTORY_KEY] as NavigationSnapshot | undefined;
      if (!value) return;
      restoringRef.current = true;
      restore(value);
      window.requestAnimationFrame(() => {
        for (const [key, top] of Object.entries(value.scrollTop ?? {})) {
          const element = scrollContainers.current.get(key);
          if (element) element.scrollTop = top;
        }
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [restore]);

  const registerScrollRestoration = useCallback((key: string, element: HTMLElement | null) => {
    if (!element) return () => undefined;
    scrollContainers.current.set(key, element);
    return () => { scrollContainers.current.delete(key); };
  }, []);

  return { registerScrollRestoration };
}
