import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { ExamSession } from "../../types";
import { requestStudyAi } from "./api";
import { setStudyAiSession } from "./requestPolicy";

vi.mock("@tauri-apps/api/core", () => ({
    isTauri: () => true,
    invoke: vi.fn(),
    Channel: class { onmessage?: (text: string) => void; },
}));
const session = { mode: "real", status: "in_progress", entryId: "exam", questions: [{ sourceReference: { sourceEntryId: "source" } }] } as unknown as ExamSession;
afterEach(() => { setStudyAiSession(null); vi.resetAllMocks(); });
describe("AI native request boundary", () => {
    it("rejects real-exam material at invocation while allowing a material-free request", async () => {
        setStudyAiSession(session);
        await expect(requestStudyAi({ context: "[{}]", images: [], sourceEntryIds: ["source"], messages: [{ role: "user", text: "질문" }] }, new AbortController().signal)).rejects.toThrow("실전");
        expect(invoke).not.toHaveBeenCalled();
        vi.mocked(invoke).mockResolvedValueOnce("자유 대화");
        await expect(requestStudyAi({ context: "[]", images: [], messages: [{ role: "user", text: "안녕" }] }, new AbortController().signal)).resolves.toBe("자유 대화");
    });
    it("cancels a now-forbidden stream and rejects its late completion without sending local authorization metadata", async () => {
        let finish!: (text: string) => void;
        let channel!: { onmessage: (text: string) => void };
        vi.mocked(invoke).mockImplementation((command, args) => {
            if (command === "cancel_study_ai") return Promise.resolve(undefined);
            channel = (args as { onDelta: typeof channel }).onDelta;
            expect((args as { request: object }).request).not.toHaveProperty("sourceEntryIds");
            return new Promise(resolve => { finish = resolve as typeof finish; });
        });
        const delta = vi.fn();
        const request = requestStudyAi({ context: "[{}]", images: [], sourceEntryIds: ["source"], messages: [{ role: "user", text: "질문" }] }, new AbortController().signal, delta);
        channel.onmessage("before");setStudyAiSession(session);channel.onmessage("late");finish("late completion");
        await expect(request).rejects.toMatchObject({ name: "AbortError" });
        expect(delta.mock.calls).toEqual([["before"]]);
        expect(invoke).toHaveBeenCalledWith("cancel_study_ai", expect.objectContaining({ requestId: expect.any(String) }));
    });
    it("rejects material payloads without their source identity",async()=>{
        await expect(requestStudyAi({context:"[{}]",images:[],messages:[{role:"user",text:"질문"}]},new AbortController().signal)).rejects.toThrow("출처");
        expect(invoke).not.toHaveBeenCalled();
    });
});
