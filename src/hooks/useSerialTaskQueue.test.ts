import { describe, expect, it, vi } from "vitest";
import { createSerialTaskQueue } from "./useSerialTaskQueue";

describe("SerialTaskQueue", () => {
  it("runs tasks in order and continues after a rejected task", async () => {
    const queue = createSerialTaskQueue();
    const order: string[] = [];
    const first = queue.enqueue(async () => {
      order.push("first");
      throw new Error("first failed");
    });
    const second = queue.enqueue(async () => {
      order.push("second");
      return "saved";
    });

    await expect(first).rejects.toThrow("first failed");
    await expect(second).resolves.toBe("saved");
    await expect(queue.drain()).resolves.toBeUndefined();
    expect(order).toEqual(["first", "second"]);
  });

  it("does not resolve drain while an enqueued task is pending", async () => {
    const queue = createSerialTaskQueue();
    let resolveTask: (() => void) | undefined;
    queue.enqueue(() => new Promise<void>((resolve) => { resolveTask = resolve; }));
    const drained = vi.fn();
    const pending = queue.drain().then(drained);
    await Promise.resolve();
    expect(drained).not.toHaveBeenCalled();
    resolveTask?.();
    await pending;
    expect(drained).toHaveBeenCalledOnce();
  });
});
