import { afterEach, describe, expect, it, vi } from "vitest";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri: () => true }));
vi.mock("../../../services/storageBackend", () => ({ getStorageBackendKind: () => "tauri", proxyRequest: vi.fn() }));
import { stageImportAssetFiles } from "../../../services/api/importAssets";
afterEach(() => vi.resetAllMocks());
describe("vision original crop staging", () => {
  it("appends only new crops to the already scoped source session", async () => {
    invoke.mockResolvedValue({ stagedFilename: "saved-crop.png", sha256: "a".repeat(64) });
    const file = new File(["crop"], "crop.png", { type: "image/png" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => new Uint8Array([1, 2]).buffer });
    const result = await stageImportAssetFiles([file], "existing-session");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("stage_import_asset_bytes", expect.objectContaining({ sessionId: "existing-session", sourceName: "crop.png" }));
    expect(result?.sessionId).toBe("existing-session");
    expect(result?.sourceToStaged).toEqual({ "crop.png": "saved-crop.png" });
  });
  it("does not create another session for a question without figures", async () => {
    expect(await stageImportAssetFiles([], "existing-session")).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
});
