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
      flushLibraryFolders: async () => { order.push("flush library"); },
      flushGptSolutionDrafts: async () => { order.push("flush gpt drafts"); },
      flushActiveExam: async () => { order.push("flush active exam"); },
      flushTransientWrites: async () => { order.push("flush transient writes"); },
      setEntriesMaintenanceBlocked: (value) => { order.push(`entries:${value}`); },
      setSettingsMaintenanceBlocked: (value) => { order.push(`settings:${value}`); },
      setGeneratedExamsMaintenanceBlocked: (value) => { order.push(`generated:${value}`); },
      setLibraryMaintenanceBlocked: (value) => { order.push(`library:${value}`); },
      setGptSolutionDraftsMaintenanceBlocked: (value) => { order.push(`gpt:${value}`); },
    }));

    await act(async () => {
      await expect(result.current(async () => { order.push("task"); return "ok"; })).resolves.toBe("ok");
    });
    expect(order.slice(0, 5)).toEqual(["entries:true", "settings:true", "generated:true", "library:true", "gpt:true"]);
    expect(order.indexOf("task")).toBeGreaterThan(order.lastIndexOf("flush"));
    expect(order.indexOf("task")).toBeGreaterThan(order.indexOf("flush active exam"));
    expect(order.indexOf("task")).toBeGreaterThan(order.indexOf("flush transient writes"));
    expect(order.slice(-5)).toEqual(["entries:false", "settings:false", "generated:false", "library:false", "gpt:false"]);
  });

  it("does not run maintenance work when active exam or transient writes fail to flush", async () => {
    const task = vi.fn(async () => undefined);
    const setBlocked = vi.fn();
    const { result } = renderHook(() => useMaintenanceCoordinator({
      flushEntries: vi.fn(async () => undefined),
      flushSettings: vi.fn(async () => undefined),
      flushGeneratedExams: vi.fn(async () => undefined),
      flushActiveExam: vi.fn(async () => { throw new Error("exam save failed"); }),
      flushTransientWrites: vi.fn(async () => undefined),
      setEntriesMaintenanceBlocked: setBlocked,
      setSettingsMaintenanceBlocked: setBlocked,
      setGeneratedExamsMaintenanceBlocked: setBlocked,
    }));

    await expect(result.current(task)).rejects.toThrow("exam save failed");
    expect(task).not.toHaveBeenCalled();
    expect(setBlocked).toHaveBeenLastCalledWith(false);
  });

  it("releases maintenance blocks when transient writes fail to flush", async () => {
    const task = vi.fn(async () => undefined);
    const setBlocked = vi.fn();
    const { result } = renderHook(() => useMaintenanceCoordinator({
      flushEntries: vi.fn(async () => undefined),
      flushSettings: vi.fn(async () => undefined),
      flushGeneratedExams: vi.fn(async () => undefined),
      flushTransientWrites: vi.fn(async () => { throw new Error("workspace save failed"); }),
      setEntriesMaintenanceBlocked: setBlocked,
      setSettingsMaintenanceBlocked: setBlocked,
      setGeneratedExamsMaintenanceBlocked: setBlocked,
    }));

    await expect(result.current(task)).rejects.toThrow("workspace save failed");
    expect(task).not.toHaveBeenCalled();
    expect(setBlocked).toHaveBeenLastCalledWith(false);
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
