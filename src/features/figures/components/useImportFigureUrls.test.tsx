import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getImageUrl } from "../../../api";
import { getImportAssetPreviewUrl } from "../../../services/api/importAssets";
import { useImportFigureUrls } from "./useImportFigureUrls";
import type { ImportAssetSessionManifest } from "../../import-workspace/model/importWorkspace";
vi.mock("../../../api", () => ({ getImageUrl: vi.fn().mockResolvedValue("blob:stored") }));
vi.mock("../../../services/api/importAssets", () => ({ getImportAssetPreviewUrl: vi.fn().mockResolvedValue("data:staged") }));

describe("temporary image boundary", () => {
  beforeEach(() => {
    vi.mocked(getImageUrl).mockClear(); vi.mocked(getImportAssetPreviewUrl).mockClear();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:upload");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });
  it("uses ZIP bytes instead of a stored file with the same name and revokes only its own URLs", async () => {
    const file = new File(["synthetic"], "same.png");
    const { result, unmount } = renderHook(() => useImportFigureUrls([file]));
    await expect(result.current("same.png")).resolves.toBe("blob:upload");
    expect(getImageUrl).not.toHaveBeenCalled();
    unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:upload");
  });
  it("does not fall back to stored files for a missing or ambiguous upload", async () => {
    const { result } = renderHook(() => useImportFigureUrls([new File([], "a.png")]));
    await expect(result.current("missing.png")).rejects.toThrow("찾을 수 없습니다");
    expect(getImageUrl).not.toHaveBeenCalled();
    const duplicate = renderHook(() => useImportFigureUrls([new File([], "a.png"), new File([], "A.png")]));
    await expect(duplicate.result.current("a.png")).rejects.toThrow("여러 개");
  });
  it("reads only the staged session and preserves errors instead of reading a stored namesake", async () => {
    const session: ImportAssetSessionManifest = { id: "session", mode: "tauri-staged", manifestVersion: 1, sourceToStaged: {}, assets: [] };
    const { result } = renderHook(() => useImportFigureUrls([], session));
    await expect(result.current("page.png")).resolves.toBe("data:staged");
    expect(getImportAssetPreviewUrl).toHaveBeenCalledWith(session, "page.png");
    vi.mocked(getImportAssetPreviewUrl).mockRejectedValueOnce(new Error("session missing"));
    await expect(result.current("page.png")).rejects.toThrow("session missing");
    expect(getImageUrl).not.toHaveBeenCalled();
  });
  it("keeps stored-image resolution for saved material without temporary assets", async () => {
    const { result } = renderHook(() => useImportFigureUrls([]));
    await act(async () => { expect(await result.current("saved.png")).toBe("blob:stored"); });
  });
});
