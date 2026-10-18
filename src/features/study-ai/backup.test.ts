import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../../types";
import { AI_STUDY_STORAGE_KEY, DEFAULT_AI_SHARING } from "./model";
import { applyBrowserBackupAtomically, type BrowserBackupPayloadV2 } from "../../services/api/backup";
import { replaceBrowserImages } from "../../services/api/browserImageStore";
vi.mock("../../services/api/browserImageStore",async original=>({...await original<typeof import("../../services/api/browserImageStore")>(),listBrowserImages:vi.fn(async()=>({"img_chat-only.png":"old-image-bytes"})),replaceBrowserImages:vi.fn(async()=>undefined)}));
const saved={version:1,conversations:[{id:"c",title:"기록",contextId:"current",updatedAt:new Date().toISOString(),messages:[],sharing:DEFAULT_AI_SHARING,materials:[],contexts:[{id:"old",sharing:DEFAULT_AI_SHARING,materials:[{id:"m",source:{sourceEntryId:"removed",sourceEntryTitle:"삭제한 원본",sourceQuestionNumber:"1"},units:[],snapshot:{id:"q",questionNumber:"1",question:"문제",choices:[],questionImages:["chat-only.png"],figures:[]}}]}]}]};
const payload=():BrowserBackupPayloadV2=>({meta:{version:2,source:"browser",createdAt:new Date().toISOString()},entries:[],settings:{} as AppSettings,browserImages:{},examSessions:[],generatedExams:[],libraryFolders:[],gptSolutionDrafts:[],importWorkspaceDraft:null,reviewSessions:[]});
afterEach(()=>{localStorage.clear();vi.clearAllMocks();});
describe("AI optional backup restore",()=>{
  it("retains an omitted conversation and its archived image when replacing the other stores",async()=>{
    localStorage.setItem(AI_STUDY_STORAGE_KEY,JSON.stringify(saved));await applyBrowserBackupAtomically(payload());
    expect(JSON.parse(localStorage.getItem(AI_STUDY_STORAGE_KEY)!)).toEqual(saved);expect(replaceBrowserImages).toHaveBeenCalledWith({"img_chat-only.png":"old-image-bytes"});
  });
  it("replaces AI records only when the backup explicitly includes them",async()=>{
    localStorage.setItem(AI_STUDY_STORAGE_KEY,JSON.stringify(saved));await applyBrowserBackupAtomically({...payload(),aiStudy:{version:1,conversations:[],drafts:[]}});
    expect(JSON.parse(localStorage.getItem(AI_STUDY_STORAGE_KEY)!)).toEqual({version:1,conversations:[],drafts:[]});expect(replaceBrowserImages).toHaveBeenCalledWith({});
  });
});
