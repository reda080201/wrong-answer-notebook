import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NavigationSnapshot } from "./useNavigationHistory";
import { useNavigationHistory } from "./useNavigationHistory";

const snapshot: NavigationSnapshot = {
  destination: "question_bank",
  section: "wrong_answer",
  selectedId: "q-1",
  search: "",
  subjectFilter: null,
  listFilter: "all",
  sortKey: "updated",
  difficultyScoreFilter: "all",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useNavigationHistory scroll restoration", () => {
  it("keeps delayed scroll positions until a container mounts", () => {
    const restore = vi.fn();
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const { result } = renderHook(() => useNavigationHistory({ snapshot, restore }));
    const savedState = {
      "wrong-answer-navigation": { ...snapshot, scrollTop: { "question-bank": 240 } },
    };

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: savedState }));
      frames.shift()?.(0);
      frames.shift()?.(0);
    });

    const element = document.createElement("div");
    act(() => {
      result.current.registerScrollRestoration("question-bank", element);
      frames.shift()?.(0);
    });

    expect(element.scrollTop).toBe(240);
  });

  it("removes the old listener when a same-key element is replaced", () => {
    const restore = vi.fn();
    const { result } = renderHook(() => useNavigationHistory({ snapshot, restore }));
    const oldElement = document.createElement("div");
    const newElement = document.createElement("div");

    act(() => {
      result.current.registerScrollRestoration("question-bank", oldElement);
      result.current.registerScrollRestoration("question-bank", newElement);
    });
    const state = window.history.state as Record<string, { scrollTop?: Record<string, number> }>;
    const before = state["wrong-answer-navigation"]?.scrollTop?.["question-bank"];

    oldElement.scrollTop = 100;
    oldElement.dispatchEvent(new Event("scroll"));
    newElement.scrollTop = 200;
    newElement.dispatchEvent(new Event("scroll"));

    const after = (window.history.state as typeof state)["wrong-answer-navigation"]?.scrollTop?.["question-bank"];
    expect(before).not.toBe(100);
    expect(after).toBe(200);
  });
});
