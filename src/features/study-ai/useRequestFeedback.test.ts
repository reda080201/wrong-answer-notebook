import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useRequestFeedback } from "./useRequestFeedback";

afterEach(() => vi.useRealTimers());
it("counts only response waiting and clears timers after finish and unmount", () => {
  vi.useFakeTimers();
  const view = renderHook(useRequestFeedback);
  act(() => view.result.current.update("waiting"));
  act(() => vi.advanceTimersByTime(10000));
  expect(view.result.current.elapsed).toBe(10);
  act(() => view.result.current.update("receiving"));
  expect(view.result.current.elapsed).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  act(() => view.result.current.update("waiting"));
  act(() => vi.advanceTimersByTime(1000));
  expect(view.result.current.elapsed).toBe(1);
  act(() => view.result.current.update("idle"));
  expect(vi.getTimerCount()).toBe(0);
  act(() => view.result.current.update("waiting"));
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
