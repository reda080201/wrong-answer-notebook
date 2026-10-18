import { afterEach, describe, expect, it } from "vitest";
import { AI_STUDY_STORAGE_KEY, DEFAULT_AI_SHARING, type AiConversation, type AiExamDraft } from "./model";
import { flushAiStudyWrites, loadAiStudyStore, saveAiExamDraft, saveAiStudyStore, setAiStudyMaintenanceBlocked } from "./storage";
afterEach(async()=>{setAiStudyMaintenanceBlocked(false);await flushAiStudyWrites().catch(()=>undefined);localStorage.clear();});
const conversation:AiConversation={id:"c",title:"대화",updatedAt:new Date().toISOString(),contextId:"ctx",messages:[],materials:[],sharing:DEFAULT_AI_SHARING};
const draft:AiExamDraft={id:"composer",materials:[],sharing:DEFAULT_AI_SHARING,config:{title:"구성",subject:"수학",count:2,minutes:30,points:10,maxPerSource:2,easy:0,medium:0,hard:0,unitCounts:{},prioritizeImportance:true,instruction:""},excluded:[],template:"free"};
describe("AI store queue",()=>{
  it("merges concurrent chat and composer writes without losing either record",async()=>{
    await Promise.all([saveAiStudyStore({version:1,conversations:[conversation]}),saveAiExamDraft(draft),saveAiStudyStore({version:1,conversations:[{...conversation,title:"새 이름"}]})]);
    expect(await loadAiStudyStore()).toMatchObject({conversations:[{title:"새 이름"}],drafts:[{id:"composer"}]});
  });
  it("blocks writes during maintenance and exposes malformed persisted data",async()=>{
    setAiStudyMaintenanceBlocked(true);await expect(saveAiExamDraft(draft)).rejects.toThrow("백업");setAiStudyMaintenanceBlocked(false);
    localStorage.setItem(AI_STUDY_STORAGE_KEY,"{broken");await expect(loadAiStudyStore()).rejects.toThrow();await expect(saveAiStudyStore({version:1,conversations:[conversation]})).rejects.toThrow();expect(localStorage.getItem(AI_STUDY_STORAGE_KEY)).toBe("{broken");
  });
});
