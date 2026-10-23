import { afterEach, describe, expect, it, vi } from "vitest";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri: () => true, Channel: class {} }));
import { generateImportWithAi } from "../../../services/api/ai";
afterEach(() => vi.resetAllMocks());
describe("staged visual AI boundary", () => {
  it("sends a scoped staged session to cancellable provider API", async () => {
    invoke.mockResolvedValue("{}");
    await expect(generateImportWithAi("observe", "input", ["staged.png"], undefined, "session-id")).resolves.toBe("{}");
    expect(invoke).toHaveBeenCalledWith("request_study_ai", expect.objectContaining({ request: expect.objectContaining({ images: ["staged.png"], imageSessionId: "session-id", json: true }) }));
    expect(invoke).not.toHaveBeenCalledWith("generate_import_with_ai", expect.anything());
  });
  it("cancels the native request and rejects a late successful result", async () => {
    let complete!: (value: string) => void;
    invoke.mockImplementation((command: string) => command === "request_study_ai" ? new Promise<string>(resolve => { complete = resolve; }) : Promise.resolve());
    const controller = new AbortController();
    const result = generateImportWithAi("observe", "input", ["staged.png"], controller.signal, "session-id");
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(); complete("late result"); await rejected;
    const requestId = invoke.mock.calls[0][1].requestId;
    expect(invoke).toHaveBeenCalledWith("cancel_study_ai", { requestId });
  });
  it("does not call the provider for an already cancelled request", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(generateImportWithAi("observe", "input", [], controller.signal, "session-id")).rejects.toMatchObject({ name: "AbortError" });
    expect(invoke).not.toHaveBeenCalled();
  });
});
