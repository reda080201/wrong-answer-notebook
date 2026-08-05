import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAppWriteRegistrations } from "./useAppWriteRegistrations";

describe("useAppWriteRegistrations", () => {
  it("flushes registered transient writers in order", async () => {
    const order: string[] = [];
    const { result } = renderHook(() => useAppWriteRegistrations());
    result.current.registerWorkspaceDraftFlush(async () => { order.push("workspace"); });
    result.current.registerQuestionBankPreferenceFlush(async () => { order.push("question-bank"); });

    await result.current.flushTransientWrites();

    expect(order).toEqual(["workspace", "question-bank"]);
  });

  it("allows a feature to unregister its writer", async () => {
    const flush = vi.fn(async () => undefined);
    const { result } = renderHook(() => useAppWriteRegistrations());
    result.current.registerWorkspaceDraftFlush(flush);
    result.current.registerWorkspaceDraftFlush(null);

    await result.current.flushTransientWrites();

    expect(flush).not.toHaveBeenCalled();
  });
});
