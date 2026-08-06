import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMaintenanceCoordinator } from "./useMaintenanceCoordinator";

describe("useMaintenanceCoordinator", () => {
  it("blocks new mutations before draining queues and always unlocks", async () => {
    const order: string[] = [];
    const { result } = renderHook(() => useMaintenanceCoordinator({
      flushEntries: async () => { order.push("flush"); },
      flushSettings: async () => { order.push("flush"); },
      flushGeneratedExams: async () => { order.push("flush"); },
      setEntriesMaintenanceBlocked: (value) => { order.push(`entries:${value}`); },
      setSettingsMaintenanceBlocked: (value) => { order.push(`settings:${value}`); },
      setGeneratedExamsMaintenanceBlocked: (value) => { order.push(`generated:${value}`); },
    }));

    await act(async () => {
      await expect(result.current(async () => { order.push("task"); return "ok"; })).resolves.toBe("ok");
    });
    expect(order.slice(0, 3)).toEqual(["entries:true", "settings:true", "generated:true"]);
    expect(order.indexOf("task")).toBeGreaterThan(order.lastIndexOf("flush"));
    expect(order.slice(-3)).toEqual(["entries:false", "settings:false", "generated:false"]);
  });

  it("rejects overlapping maintenance work without releasing the first lock", async () => {
    let release!: () => void;
    const { result } = renderHook(() => useMaintenanceCoordinator({
      flushEntries: vi.fn(async () => undefined),
      flushSettings: vi.fn(async () => undefined),
      flushGeneratedExams: vi.fn(async () => undefined),
      setEntriesMaintenanceBlocked: vi.fn(),
      setSettingsMaintenanceBlocked: vi.fn(),
      setGeneratedExamsMaintenanceBlocked: vi.fn(),
    }));
    const first = result.current(() => new Promise<string>((resolve) => { release = () => resolve("done"); }));
    await expect(result.current(async () => "second")).rejects.toThrow("이미 진행 중");
    release();
    await expect(first).resolves.toBe("done");
  });
});
