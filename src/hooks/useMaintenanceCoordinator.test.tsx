import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMaintenanceCoordinator } from "./useMaintenanceCoordinator";

describe("useMaintenanceCoordinator", () => {
  it("blocks new mutations before flushing and always releases the block", async () => {
    const events: string[] = [];
    const flushEntries = vi.fn(async () => { events.push("flush entries"); });
    const flushSettings = vi.fn(async () => { events.push("flush settings"); });
    const flushGeneratedExams = vi.fn(async () => { events.push("flush exams"); });
    const setBlocked = (name: string) => (blocked: boolean) => events.push(`${name}:${blocked}`);
    const { result } = renderHook(() => useMaintenanceCoordinator({
      flushEntries,
      flushSettings,
      flushGeneratedExams,
      setEntriesMaintenanceBlocked: setBlocked("entries"),
      setSettingsMaintenanceBlocked: setBlocked("settings"),
      setGeneratedExamsMaintenanceBlocked: setBlocked("exams"),
    }));
    await result.current(async () => { events.push("backup"); });
    expect(events.slice(0, 3)).toEqual(["entries:true", "settings:true", "exams:true"]);
    expect(events.indexOf("backup")).toBeGreaterThan(events.indexOf("flush exams"));
    expect(events.slice(-3)).toEqual(["entries:false", "settings:false", "exams:false"]);
  });

  it("releases the block when flushing fails", async () => {
    const blocked = vi.fn();
    const { result } = renderHook(() => useMaintenanceCoordinator({
      flushEntries: vi.fn().mockRejectedValue(new Error("disk")),
      flushSettings: vi.fn().mockResolvedValue(undefined),
      flushGeneratedExams: vi.fn().mockResolvedValue(undefined),
      setEntriesMaintenanceBlocked: blocked,
      setSettingsMaintenanceBlocked: blocked,
      setGeneratedExamsMaintenanceBlocked: blocked,
    }));
    await expect(result.current(async () => undefined)).rejects.toThrow("disk");
    await waitFor(() => expect(blocked).toHaveBeenLastCalledWith(false));
  });
});
