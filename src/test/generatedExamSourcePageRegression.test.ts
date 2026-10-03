import { expect, it } from "vitest";
import { migrateQuestionSource } from "../features/exam-builder/services/questionSource";
import { createSessionFromGeneratedExam } from "../features/exam-builder/services/createSessionFromGeneratedExam";
const entry = {id:"e",title:"source",tags:[],subject:"math",question:"1. body",sourcePageImages:["page1.png","page2.png"],structuredQuestions:[{questionNumber:"1",questionText:"body",choices:[],conditions:[],equations:[],contentSegments:[],figureIds:[],source:{page:2}}]};
const generated = {position:1,source:{sourceEntryId:"e",sourceQuestionNumber:"1"},snapshot:{id:"q",questionNumber:"1",question:"body",choices:[],questionImages:[],figures:[]},locked:true};
it("audit: runtime source metadata hydration must select the real source page for a legacy snapshot",()=>{
  const normalized=migrateQuestionSource(generated as never,[entry as never]);
  const session=createSessionFromGeneratedExam({id:"exam",questions:[normalized]} as never,new Date(),{mode:"real"});
  console.log("AUDIT_LEGACY_PAGE",JSON.stringify({snapshot:normalized.snapshot,pages:session.sourcePageImages,selected:session.selectedSourcePageImages}));
  expect(session.selectedSourcePageImages).toContain("page2.png");
});
it("audit: live page reorder must not reinterpret indices against the old snapshot page list",()=>{
  const stored={...generated,snapshot:{...generated.snapshot,source:{page:1},sourcePageImages:["page1.png","page2.png"]}};
  const reordered={...entry,sourcePageImages:["page2.png","page1.png"]};
  const normalized=migrateQuestionSource(stored as never,[reordered as never]);
  const session=createSessionFromGeneratedExam({id:"exam",questions:[normalized]} as never,new Date(),{mode:"real"});
  console.log("AUDIT_REORDER_PAGE",JSON.stringify({snapshot:normalized.snapshot,selected:session.selectedSourcePageImages}));
  expect(session.selectedSourcePageImages).toEqual(["page1.png"]);
});
