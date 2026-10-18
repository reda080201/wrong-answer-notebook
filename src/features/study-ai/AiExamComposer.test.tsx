import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WrongAnswerEntry } from "../../types";
import AiExamComposer from "./AiExamComposer";
import { entryAiMaterials } from "./model";
import { requestStudyAi } from "./api";
vi.mock("./api",()=>({requestStudyAi:vi.fn()}));
vi.mock("../../shared/ui/AppDialogProvider",()=>({useAppDialog:()=>({confirm:async()=>true})}));
const entry=(id:string):WrongAnswerEntry=>({id,title:`원본 ${id}`,subject:"수학",entryKind:"problem_sheet",question:"1. 문제 본문\n① A\n② B",tags:[],questionImages:[],memo:"메모",answerKey:[{id:`a-${id}`,questionNumber:"1",answer:"①",explanation:"해설",importantPoints:[]}],questionMeta:[],createdAt:"2026-01-01",updatedAt:"2026-01-01",explanationParts:[],annotations:[],difficulty:"medium",difficult:false,mastered:false,myAnswer:"",correctAnswer:""});
afterEach(()=>{localStorage.clear();vi.clearAllMocks();});
describe("AI exam composer integration",()=>{
  it("materializes a provider selection from local snapshots, retains it on failure, and only saves on explicit confirmation",async()=>{
    const entries=[entry("one"),entry("two")];const materials=entries.flatMap(entryAiMaterials);const onSave=vi.fn().mockResolvedValue(undefined);const onClose=vi.fn();
    vi.mocked(requestStudyAi).mockImplementationOnce(async()=>JSON.stringify({summary:"균형 배치",questions:materials.map(m=>({id:m.id,points:5,reason:"중요도 반영"}))}));
    render(<AiExamComposer entries={entries} initialMaterials={materials} onSave={onSave} onStart={vi.fn()} onClose={onClose}/>);
    await waitFor(()=>expect(screen.queryByText("구성 초안 불러오는 중…")).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("문항 수",{exact:true}),{target:{value:"2"}});fireEvent.change(screen.getByLabelText("총점",{exact:true}),{target:{value:"10"}});
    fireEvent.click(screen.getByRole("button",{name:/^구성안 요청$/}));await screen.findByText("균형 배치");expect(onSave).not.toHaveBeenCalled();expect(requestStudyAi).toHaveBeenCalledTimes(1);
    const sent=vi.mocked(requestStudyAi).mock.calls[0][0];expect(sent.context).toContain("문제 본문");expect(sent.context).not.toContain('"answer"');expect(sent.context).not.toContain('"explanation"');
    vi.mocked(requestStudyAi).mockRejectedValueOnce(new Error("네트워크 실패"));fireEvent.click(screen.getByRole("button",{name:/^구성안 다시 제안$/}));await screen.findByText("네트워크 실패");expect(screen.getByText("균형 배치")).toBeInTheDocument();
    expect(screen.getByText("원본 one · 원문 1번")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("출처 표시"));
    expect(screen.queryByText("원본 one · 원문 1번")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("출처 표시"));
    expect(screen.getByText("원본 one · 원문 1번")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("출처 표시"));
    fireEvent.click(screen.getByRole("button",{name:/^검토한 구성 저장$/}));await waitFor(()=>expect(onSave).toHaveBeenCalledTimes(1));expect(onSave.mock.calls[0][0].showSourceReferences).toBe(false);expect(onSave.mock.calls[0][0].questions.map((q:{source:{sourceEntryTitle:string}})=>q.source.sourceEntryTitle)).toEqual(["원본 one","원본 two"]);expect(onClose).toHaveBeenCalledTimes(1);
  });
});
