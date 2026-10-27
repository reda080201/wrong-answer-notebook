import { describe, expect, it } from "vitest";
import cases from "../../../../tools/diagram_pipeline/tests/fixtures/vision-v2-cases.json";
import { parseVisionAnalysis, validateStudyAssessment } from "./visionSchema";
import { mapAssessmentLearning } from "./assessmentLearning";
import { mapVisionAssessment } from "./assessmentMapping";
import { resolvePageRoles } from "./pageRoles";
const fixture = () => parseVisionAnalysis(cases.find(row=>row.valid)!.text);
describe("v8.2 enrichment and source boundaries",()=>{
 it("preserves printed explanation metadata and deterministic deduplicated draft cards",()=>{
  const entry=fixture().entries[0], q=entry.questions[0];
  q.studyAssessment!.learning.candidates=[{type:"concept",title:"개념",content:"핵심  개념"},{type:"concept",title:"같은 개념",content:"핵심 개념"}];
  Object.assign(q.studyAssessment!.sourceAnswer,{intent:"원문 의도",notes:"원문 메모",choiceJudgements:[{marker:"①",text:"원문 설명"}]});
  validateStudyAssessment(q.studyAssessment);
  const first=mapAssessmentLearning(entry);
  expect(first).toHaveLength(1); expect(first[0]).toMatchObject({reviewStatus:"draft",sourceQuestionNumber:q.questionNumber});
  expect(mapAssessmentLearning(entry)[0].id).toBe(first[0].id);
  expect(mapAssessmentLearning({...entry,entryKey:"other"})[0].id).not.toBe(first[0].id);
  expect(mapVisionAssessment(q,"id","now").answer).toMatchObject({intent:"원문 의도",notes:"원문 메모",choiceJudgements:[{marker:"①",text:"원문 설명"}]});
 });
 it("rejects printed metadata without source evidence and leaves actual learner causes absent",()=>{
  const q=fixture().entries[0].questions[0];
  q.studyAssessment!.sourceAnswer={status:"not_provided",value:null,explanation:null,intent:"推測"};
  expect(()=>validateStudyAssessment(q.studyAssessment)).toThrow();
  expect(mapVisionAssessment(fixture().entries[0].questions[0],"id","now").answer).not.toHaveProperty("mistakeAnalysis");
 });
 it("requires exact mixed physical-page selections and isolates answer/excluded pages",()=>{
  const source={sourceKey:"s1",pages:[new File(["1"],"1.png"),new File(["2"],"2.png"),new File(["3"],"3.png")]};
  expect(()=>resolvePageRoles([source],["mixed"],[])).toThrow();
  const rows=resolvePageRoles([source],["mixed"],[{sourceKey:"s1",page:1,role:"problem"},{sourceKey:"s1",page:2,role:"answer"},{sourceKey:"s1",page:3,role:"exclude"}]);
  expect(rows.filter(r=>r.role==="problem").map(r=>r.page)).toEqual([1]);
  expect(()=>resolvePageRoles([source],["mixed"],[...rows,rows[0]])).toThrow();
 });
});
import { preserveAssessmentEdits } from "./preserveAssessmentEdits";
import { applyAssessmentScores } from "./assessmentUpdates";
it("retains manual curation on same-source reanalysis and applies only an explicitly chosen score",()=>{
  const analysis=fixture(), text=JSON.stringify(analysis);
  const meta=mapVisionAssessment(analysis.entries[0].questions[0],"a","now").meta!;
  const old={...meta,important:false,difficultyScore:33,classification:{...meta.classification,difficultySource:"manual" as const},rating:{importanceScore:50,qualityScore:47,evaluationSource:"manual" as const}};
  const job={version:1 as const,id:"job",analysisText:text,sourceFiles:[{sourceKey:analysis.sources[0].sourceKey,name:"source.pdf",sha256:"a".repeat(64)}]};
  const next=preserveAssessmentEdits({questionMeta:[old]},{questionMeta:[meta]},job,job).questionMeta![0];
  expect(next).toMatchObject({difficultyScore:33,important:false,rating:{importanceScore:50,qualityScore:47,evaluationSource:"manual"}});
  expect(applyAssessmentScores(next,{difficulty:true,importance:false})).toMatchObject({difficultyScore:72,important:false,rating:{importanceScore:50,qualityScore:47}});
  expect(preserveAssessmentEdits({questionMeta:[old]},{questionMeta:[meta]},job,{...job,sourceFiles:[{...job.sourceFiles[0],sha256:"b".repeat(64)}]}).questionMeta![0].difficultyScore).toBe(72);
});
