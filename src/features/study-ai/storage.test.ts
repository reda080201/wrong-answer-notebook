import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_STUDY_STORAGE_KEY, DEFAULT_AI_SHARING, type AiConversation, type AiExamDraft } from "./model";
import { deleteAiConversation, discardPendingAiStudyWrites, flushAiStudyWrites, hasPendingAiStudyWrites, loadAiStudyStore, saveAiConversation, saveAiExamDraft, saveAiStudyStore, setAiStudyMaintenanceBlocked } from "./storage";
afterEach(async()=>{setAiStudyMaintenanceBlocked(false);await flushAiStudyWrites().catch(()=>undefined);discardPendingAiStudyWrites();vi.restoreAllMocks();localStorage.clear();});
const conversation:AiConversation={id:"c",title:"대화",updatedAt:new Date().toISOString(),contextId:"ctx",messages:[],materials:[],sharing:DEFAULT_AI_SHARING};
const draft:AiExamDraft={id:"composer",materials:[],sharing:DEFAULT_AI_SHARING,config:{title:"구성",subject:"수학",count:2,minutes:30,points:10,maxPerSource:2,easy:0,medium:0,hard:0,unitCounts:{},prioritizeImportance:true,instruction:""},excluded:[],template:"free"};
describe("AI store queue",()=>{
  it("deletes a conversation and its owned draft in one commit, preserving both on write failure",async()=>{
    const subject={...conversation,id:"delete-fail"};
    await saveAiStudyStore({version:1,conversations:[subject,{...conversation,id:"other"}]});
    await saveAiExamDraft({...draft,id:"conversation:delete-fail"});await saveAiExamDraft({...draft,id:"conversation:other"});
    const original=localStorage.getItem(AI_STUDY_STORAGE_KEY);
    const failure=vi.spyOn(Storage.prototype,"setItem").mockImplementationOnce(()=>{throw new Error("disk full");});
    await expect(deleteAiConversation("delete-fail")).rejects.toThrow("disk full");
    expect(localStorage.getItem(AI_STUDY_STORAGE_KEY)).toBe(original);
    failure.mockRestore();await deleteAiConversation("delete-fail");
    expect(await loadAiStudyStore()).toMatchObject({conversations:[{id:"other"}],drafts:[{id:"conversation:other"}]});
    await expect(saveAiExamDraft({...draft,id:"conversation:delete-fail"})).rejects.toThrow("삭제된");
    await expect(saveAiConversation(subject)).rejects.toThrow("삭제된");
  });
  it("preserves an unrelated concurrent conversation while deleting and rejects a late owned draft",async()=>{
    const subject={...conversation,id:"delete-concurrent"}; await saveAiConversation(subject,true);
    const deletion=deleteAiConversation(subject.id);
    const creation=saveAiConversation({...conversation,id:"new"},true);
    const lateDraft=saveAiExamDraft({...draft,id:`conversation:${subject.id}`});
    await Promise.all([deletion,creation,expect(lateDraft).rejects.toThrow("삭제된")]);
    expect((await loadAiStudyStore()).conversations.map(c=>c.id)).toEqual(["new"]);
  });
  it("recovers a failed conversation before maintenance, and blocks maintenance if recovery still fails",async()=>{
    const failure=vi.spyOn(Storage.prototype,"setItem").mockImplementation(()=>{throw new Error("disk full");});
    await expect(saveAiConversation(conversation,true)).rejects.toThrow("disk full");
    expect(hasPendingAiStudyWrites()).toBe(true);setAiStudyMaintenanceBlocked(true);
    await expect(flushAiStudyWrites()).rejects.toThrow("disk full");
    expect(hasPendingAiStudyWrites()).toBe(true);
    failure.mockRestore();await flushAiStudyWrites();
    expect(hasPendingAiStudyWrites()).toBe(false);
    expect((await loadAiStudyStore()).conversations).toEqual([conversation]);
    await expect(saveAiConversation({...conversation,title:"blocked"})).rejects.toThrow("백업");
  });
  it("updates one conversation without overwriting another or its draft",async()=>{
    await saveAiConversation(conversation,true);await saveAiConversation({...conversation,id:"other"},true);await saveAiExamDraft(draft);
    await Promise.all([saveAiConversation({...conversation,title:"updated"}),saveAiConversation({...conversation,id:"other",title:"other updated"})]);
    const saved=await loadAiStudyStore();expect(saved.conversations.map(c=>c.title).sort()).toEqual(["other updated","updated"]);expect(saved.drafts).toEqual([draft]);
  });
  it("allows an explicitly restored conversation after maintenance without reviving a late pre-restore write",async()=>{
    const c={...conversation,id:"restore-case"};await saveAiConversation(c,true);await deleteAiConversation(c.id);
    await expect(saveAiConversation(c,true)).rejects.toThrow("삭제된");
    setAiStudyMaintenanceBlocked(true);await flushAiStudyWrites();
    localStorage.setItem(AI_STUDY_STORAGE_KEY,JSON.stringify({version:1,conversations:[c]}));
    setAiStudyMaintenanceBlocked(false);await saveAiConversation({...c,title:"복원 후 수정"});
    expect((await loadAiStudyStore()).conversations[0].title).toBe("복원 후 수정");
  });
  it("merges concurrent chat and composer writes without losing either record",async()=>{
    await Promise.all([saveAiStudyStore({version:1,conversations:[conversation]}),saveAiExamDraft(draft),saveAiStudyStore({version:1,conversations:[{...conversation,title:"새 이름"}]})]);
    expect(await loadAiStudyStore()).toMatchObject({conversations:[{title:"새 이름"}],drafts:[{id:"composer"}]});
  });
  it("blocks writes during maintenance and exposes malformed persisted data",async()=>{
    setAiStudyMaintenanceBlocked(true);await expect(saveAiExamDraft(draft)).rejects.toThrow("백업");setAiStudyMaintenanceBlocked(false);
    localStorage.setItem(AI_STUDY_STORAGE_KEY,"{broken");await expect(loadAiStudyStore()).rejects.toThrow();await expect(saveAiStudyStore({version:1,conversations:[conversation]})).rejects.toThrow();expect(localStorage.getItem(AI_STUDY_STORAGE_KEY)).toBe("{broken");
  });
});
