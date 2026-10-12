import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteBrowserImage, getBrowserImage, putBrowserImage } from "./browserImageStore";
import { saveImageFiles } from "./images";
import { validPngBytes } from "../../test/fixtures/validPng";

// Deliver request success separately from commit, as real IndexedDB does.
function database(abort: boolean, stored: string | null = null, readError = false) {
  const transactions: Record<string, unknown>[] = [];
  const close = vi.fn();
  const db = {
    close,
    transaction: () => {
      const tx: Record<string, unknown> = { error: null };
      transactions.push(tx);
      const request = () => {
        const req: Record<string, unknown> = { result: stored };
        queueMicrotask(() => {
          if (readError) {
            req.error = new Error("read failed");
            (req.onerror as (() => void) | undefined)?.();
            return;
          }
          (req.onsuccess as (() => void) | undefined)?.();
          queueMicrotask(() => (tx[abort ? "onabort" : "oncomplete"] as (() => void) | undefined)?.());
        });
        return req;
      };
      tx.objectStore = () => ({ put: request, delete: request, get: request });
      return tx;
    },
  };
  vi.stubGlobal("indexedDB", { open: () => {
    const req: Record<string, unknown> = { result: db };
    queueMicrotask(() => (req.onsuccess as (() => void))());
    return req;
  } });
  return { close, transactions };
}

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe("browser image transaction durability", () => {
  it("propagates an aborted image write through the upload API without returning an ID", async () => {
    database(true);
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 1, height: 1, close: vi.fn() }));
    await expect(saveImageFiles([new File([validPngBytes], "valid.png", { type: "image/png" })])).rejects.toThrow("저장");
    expect(localStorage.length).toBe(0);
  });
  it("rejects put after request success when the transaction aborts", async () => {
    const { close } = database(true);
    await expect(putBrowserImage("img_a.png", "data")).rejects.toThrow();
    expect(close).toHaveBeenCalledOnce();
  });
  it("rejects delete abort and retains the legacy copy", async () => {
    const { close } = database(true);
    localStorage.setItem("img_a.png", "legacy");
    await expect(deleteBrowserImage("img_a.png")).rejects.toThrow();
    expect(localStorage.getItem("img_a.png")).toBe("legacy");
    expect(close).toHaveBeenCalledOnce();
  });
  it("does not remove a legacy image when its migration write aborts", async () => {
    database(true);
    localStorage.setItem("img_a.png", "legacy");
    await expect(getBrowserImage("img_a.png")).rejects.toThrow();
    expect(localStorage.getItem("img_a.png")).toBe("legacy");
    database(false);
    await expect(getBrowserImage("img_a.png")).resolves.toBe("legacy");
    expect(localStorage.getItem("img_a.png")).toBeNull();
  });
  it("closes the database when a read fails", async () => {
    const { close } = database(false, null, true);
    await expect(getBrowserImage("img_a.png")).rejects.toThrow("read failed");
    expect(close).toHaveBeenCalledOnce();
  });
  it("settles only after transaction completion", async () => {
    const { transactions } = database(false);
    await expect(putBrowserImage("img_a.png", "data")).resolves.toBeUndefined();
    expect(transactions[0].oncomplete).toBeTypeOf("function");
    localStorage.setItem("img_a.png", "legacy");
    await deleteBrowserImage("img_a.png");
    expect(localStorage.getItem("img_a.png")).toBeNull();
  });
  it("serializes concurrent writes so a later delete cannot be overtaken by an earlier put", async () => {
    const transactions: Array<{ oncomplete?: () => void; onerror?: () => void; onabort?: () => void; objectStore: () => { put: () => void; delete: () => void } }> = [];
    const db = {
      close: vi.fn(),
      transaction: () => {
        const transaction = { objectStore: () => ({ put: vi.fn(), delete: vi.fn() }) } as (typeof transactions)[number];
        transactions.push(transaction);
        return transaction;
      },
    };
    vi.stubGlobal("indexedDB", { open: () => {
      const request: Record<string, unknown> = { result: db };
      queueMicrotask(() => (request.onsuccess as (() => void))());
      return request;
    } });
    const put = putBrowserImage("img_ordered.png", "new");
    const remove = deleteBrowserImage("img_ordered.png");
    await vi.waitFor(() => expect(transactions).toHaveLength(1));
    expect(transactions[0].objectStore).toBeTypeOf("function");
    transactions[0].oncomplete?.();
    await put;
    await vi.waitFor(() => expect(transactions).toHaveLength(2));
    transactions[1].oncomplete?.();
    await remove;
    expect(db.close).toHaveBeenCalledTimes(2);
  });
  it("keeps the localStorage fallback", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await putBrowserImage("img_a.png", "data");
    expect(await getBrowserImage("img_a.png")).toBe("data");
    await deleteBrowserImage("img_a.png");
    expect(await getBrowserImage("img_a.png")).toBeNull();
  });
});
