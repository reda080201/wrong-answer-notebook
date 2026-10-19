import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_AI_SHARING, type AiStudyStore } from "./model";
import { deleteAiConversation, discardPendingAiStudyWrites, flushAiStudyWrites, loadAiStudyStore, saveAiConversation, setAiStudyMaintenanceBlocked } from "./storage";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: vi.fn() }));
afterEach(async () => { setAiStudyMaintenanceBlocked(false);discardPendingAiStudyWrites();await flushAiStudyWrites().catch(()=>undefined);vi.resetAllMocks(); });
describe("AI native persistence adapter", () => {
    it("preserves duplicate native records and blocks ambiguous deletion",async()=>{
        const c={id:"duplicate-native",title:"one",updatedAt:"2026-01-01",contextId:"ctx",messages:[],materials:[],sharing:DEFAULT_AI_SHARING};
        vi.mocked(invoke).mockResolvedValue({version:1,conversations:[c,{...c,title:"two"}]});
        await expect(deleteAiConversation(c.id)).rejects.toThrow("ID");
        expect(vi.mocked(invoke).mock.calls.every(([command])=>command==="load_ai_study_store")).toBe(true);
    });
    it("commits deletion as one native save and preserves the old document on a rejected save",async()=>{
        let disk:AiStudyStore={version:1,conversations:[{id:"native-c",title:"대화",updatedAt:"2026-01-01",contextId:"ctx",messages:[],materials:[],sharing:DEFAULT_AI_SHARING}],drafts:[]};
        let fail=true;let saves=0;
        vi.mocked(invoke).mockImplementation(async(command,args)=>{
            if(command==="load_ai_study_store")return structuredClone(disk);
            saves++;if(fail)throw new Error("native write failed");disk=structuredClone((args as {store:AiStudyStore}).store);
        });
        await expect(deleteAiConversation("native-c")).rejects.toThrow("native write failed");
        expect((await loadAiStudyStore()).conversations).toHaveLength(1);expect(saves).toBe(1);
        fail=false;await deleteAiConversation("native-c");expect(saves).toBe(2);expect(disk.conversations).toEqual([]);
        await saveAiConversation({id:"native-new",title:"새 대화",updatedAt:"2026-01-01",contextId:"new-ctx",messages:[],materials:[],sharing:DEFAULT_AI_SHARING},true);
        expect((await loadAiStudyStore()).conversations[0].id).toBe("native-new");
    });
});
