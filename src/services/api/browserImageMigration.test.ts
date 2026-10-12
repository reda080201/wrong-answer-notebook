import { afterEach, expect, it, vi } from "vitest";
import { getBrowserImage, listBrowserImages } from "./browserImageStore";

// Requests and commit are separate; writes are staged until the transaction commits.
function imageDatabase(initial: Record<string, string>, abort = false, beforeCommit?: () => void) {
  const data = new Map(Object.entries(initial));
  const close = vi.fn();
  const db = { close, transaction: () => {
    const staged = new Map(data);
    let pending = 0;
    let finished = false;
    const tx: Record<string, unknown> = {};
    const request = (operation: () => unknown) => {
      pending++;
      const req: Record<string, unknown> = {};
      queueMicrotask(() => {
        req.result = operation();
        (req.onsuccess as (() => void) | undefined)?.();
        pending--;
        queueMicrotask(() => {
          if (pending || finished) return;
          finished = true;
          beforeCommit?.();
          if (!abort) { data.clear(); staged.forEach((value, key) => data.set(key, value)); }
          (tx[abort ? "onabort" : "oncomplete"] as (() => void) | undefined)?.();
        });
      });
      return req;
    };
    tx.objectStore = () => ({
      get: (key: string) => request(() => staged.get(key)),
      put: (value: string, key: string) => request(() => staged.set(key, value)),
      getAll: () => request(() => [...staged.values()]),
      getAllKeys: () => request(() => [...staged.keys()]),
    });
    return tx;
  } };
  vi.stubGlobal("indexedDB", { open: () => {
    const req: Record<string, unknown> = { result: db };
    queueMicrotask(() => (req.onsuccess as (() => void))());
    return req;
  } });
  return { data, close };
}

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

it("preserves both conflicting values and blocks a misleading backup image list", async () => {
  const { data, close } = imageDatabase({ img_same: "committed" });
  localStorage.setItem("img_same", "legacy");
  await expect(listBrowserImages()).rejects.toThrow("충돌");
  expect(data.get("img_same")).toBe("committed");
  expect(localStorage.getItem("img_same")).toBe("legacy");
  expect(await getBrowserImage("img_same")).toBe("committed");
  expect(close).toHaveBeenCalled();
});

it("migrates missing values and removes identical legacy values only after commit", async () => {
  imageDatabase({ img_same: "same" });
  localStorage.setItem("img_same", "same");
  localStorage.setItem("img_missing", "legacy");
  expect(await listBrowserImages()).toEqual({ img_same: "same", img_missing: "legacy" });
  expect(localStorage.length).toBe(0);
});

it("preserves legacy sources and committed values when migration aborts", async () => {
  const { data, close } = imageDatabase({ img_same: "same" }, true);
  localStorage.setItem("img_same", "same");
  localStorage.setItem("img_missing", "legacy");
  await expect(listBrowserImages()).rejects.toThrow();
  expect(data.has("img_missing")).toBe(false);
  expect(localStorage.length).toBe(2);
  expect(close).toHaveBeenCalledOnce();
});

it("does not remove a legacy value changed while the migration was running", async () => {
  imageDatabase({}, false, () => localStorage.setItem("img_missing", "changed"));
  localStorage.setItem("img_missing", "original");
  expect(await listBrowserImages()).toEqual({ img_missing: "original" });
  expect(localStorage.getItem("img_missing")).toBe("changed");
});
