import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "./commandRegistry";

describe("CommandRegistry", () => {
  it("only executes currently available commands", async () => {
    const run = vi.fn();
    const registry = new CommandRegistry();
    registry.register({ id: "hidden", key: "K", label: "K", description: "숨김", available: () => false, run });
    registry.register({ id: "shown", key: "J", label: "J", description: "표시", run });
    await expect(registry.runKey("K")).resolves.toBe(false);
    await expect(registry.runKey("J")).resolves.toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
