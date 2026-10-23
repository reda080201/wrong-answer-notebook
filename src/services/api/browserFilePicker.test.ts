import { afterEach, expect, it, vi } from "vitest";
import { pickBrowserFiles } from "./browserFilePicker";
import { selectBackupSource } from "./backup";
import { pickImages } from "./images";
afterEach(() => { vi.restoreAllMocks(); document.querySelectorAll('input[type="file"]').forEach(input => input.remove()); });
it("finishes backup cancellation and removes the temporary picker", async () => {
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) { this.dispatchEvent(new Event("cancel")); });
  await expect(selectBackupSource()).resolves.toBeNull();
  expect(document.querySelector('input[type="file"]')).toBeNull();
});
it("finishes normal image cancellation without writing an image", async () => {
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) { this.dispatchEvent(new Event("cancel")); });
  await expect(pickImages()).resolves.toEqual([]);
});
it("returns the selected file and ignores a later cancellation", async () => {
  const file = new File(["{}"], "backup.json", { type: "application/json" });
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
    Object.defineProperty(this, "files", { value: [file] });
    this.dispatchEvent(new Event("change"));
    this.dispatchEvent(new Event("cancel"));
    expect(this.onchange).toBeNull(); expect(this.oncancel).toBeNull();
  });
  await expect(pickBrowserFiles(".json")).resolves.toEqual([file]);
});
it("cleans up and rejects when opening the picker throws, then allows retry", async () => {
  const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementationOnce(() => { throw new Error("cannot open picker"); }).mockImplementation(function (this: HTMLInputElement) { this.dispatchEvent(new Event("cancel")); });
  await expect(pickBrowserFiles(".json")).rejects.toThrow("cannot open picker");
  await expect(pickBrowserFiles(".json")).resolves.toEqual([]);
  expect(click).toHaveBeenCalledTimes(2);
});
