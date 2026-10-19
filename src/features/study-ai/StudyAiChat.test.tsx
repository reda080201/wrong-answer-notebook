import { entryAiMaterials, DEFAULT_AI_SHARING } from "./model";
import { proposalFromSelection, type AiExamConfig } from "./examProposal";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamSession, WrongAnswerEntry } from "../../types";
import StudyAiChat from "./StudyAiChat";
import { requestStudyAi } from "./api";
import { AI_STUDY_STORAGE_KEY } from "./model";
import { StrictMode } from "react";
import { discardPendingAiStudyWrites, flushAiStudyWrites } from "./storage";
vi.mock("./api", () => ({ requestStudyAi: vi.fn(async () => "AI 답변") }));
const dialogs=vi.hoisted(()=>({confirm:vi.fn(async()=>true),prompt:vi.fn(async()=>"바뀐 이름")}));
vi.mock("../../shared/ui/AppDialogProvider", () => ({ useAppDialog: () => dialogs }));
const entry = { id: "entry", title: "원본 시험지", subject: "수학", entryKind: "problem_sheet", question: "1. 문제 본문\n① A\n② B", tags: [], questionImages: [], memo: "PRIVATE_MEMO", answerKey: [{ id: "a", questionNumber: "1", answer: "ANSWER_SECRET", explanation: "EXPLANATION_SECRET", importantPoints: [] }], questionMeta: [], createdAt: "2026-01-01", updatedAt: "2026-01-01", explanationParts: [], annotations: [], difficulty: "medium", difficult: false, mastered: false, myAnswer: "", correctAnswer: "" } as WrongAnswerEntry;
const props = { entries: [entry], selectedEntryId: entry.id, session: null, onSaveExam: vi.fn(), onStartExam: vi.fn(), onSettings: vi.fn() };
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() }); });
afterEach(async () => { await flushAiStudyWrites().catch(() => undefined); discardPendingAiStudyWrites(); vi.restoreAllMocks(); localStorage.clear(); });
async function open() { fireEvent.click(screen.getByRole("button", { name: "AI 학습 대화 열기" })); await waitFor(() => expect(screen.queryByText("대화 불러오는 중…")).not.toBeInTheDocument()); }
async function send(text: string) { fireEvent.change(screen.getByLabelText("메시지"), { target: { value: text } }); fireEvent.click(screen.getByRole("button", { name: "전송" })); await waitFor(() => expect(screen.getAllByText("AI 답변").length).toBeGreaterThan(0)); }
describe("study AI chat integration", () => {
    it("preserves both the conversation and its draft when the deletion commit fails",async()=>{
        const original={version:1,conversations:[{id:"delete-chat",title:"삭제 대상",updatedAt:"2026-01-01",contextId:"ctx",messages:[],materials:[],sharing:DEFAULT_AI_SHARING}],drafts:[{id:"conversation:delete-chat",materials:[],sharing:DEFAULT_AI_SHARING,config:{title:"초안",subject:"수학",count:1,minutes:30,points:10,maxPerSource:1,easy:0,medium:0,hard:0,unitCounts:{},prioritizeImportance:true,instruction:""},excluded:[],template:"free"}]};
        localStorage.setItem(AI_STUDY_STORAGE_KEY,JSON.stringify(original));render(<StudyAiChat {...props}/>);await open();
        const write=Storage.prototype.setItem;
        const failure=vi.spyOn(Storage.prototype,"setItem").mockImplementation(function(this:Storage,key:string,value:string){if(key===AI_STUDY_STORAGE_KEY&&!JSON.parse(value).conversations.some((c:{id:string})=>c.id==="delete-chat"))throw new Error("삭제 저장 실패");write.call(this,key,value);});
        fireEvent.click(screen.getByText("대화 관리"));fireEvent.click(screen.getByRole("button",{name:"삭제",exact:true}));await screen.findByText("삭제 저장 실패");
        expect(JSON.parse(localStorage.getItem(AI_STUDY_STORAGE_KEY)!)).toEqual(original);expect(screen.getByRole("combobox",{name:"대화 기록"})).toHaveValue("delete-chat");failure.mockRestore();
    });
    it("finishes its initial reload under StrictMode effect replay",async()=>{
        render(<StrictMode><StudyAiChat {...props}/></StrictMode>);await open();
        fireEvent.change(screen.getByLabelText("메시지"),{target:{value:"strict question"}});
        expect(screen.getByRole("button",{name:"전송"})).toBeEnabled();
    });
    it("keeps dirty memory when reload is declined, then clears it only after a confirmed successful reload",async()=>{
        render(<StudyAiChat {...props}/>);await open();
        const failure=vi.spyOn(Storage.prototype,"setItem").mockImplementation(()=>{throw new Error("저장 실패");});
        fireEvent.change(screen.getByLabelText("메시지"),{target:{value:"미저장 질문"}});fireEvent.click(screen.getByRole("button",{name:"전송"}));
        await screen.findByRole("button",{name:"저장본으로 돌아가기"});
        dialogs.confirm.mockResolvedValueOnce(false);fireEvent.click(screen.getByRole("button",{name:"저장본으로 돌아가기"}));
        await waitFor(()=>expect(dialogs.confirm).toHaveBeenCalledTimes(1));expect(screen.getByRole("button",{name:"저장 재시도"})).toBeInTheDocument();
        failure.mockRestore();fireEvent.click(screen.getByRole("button",{name:"저장본으로 돌아가기"}));
        await waitFor(()=>expect(screen.queryByRole("button",{name:"저장 재시도"})).not.toBeInTheDocument());
        await expect(flushAiStudyWrites()).resolves.toBeUndefined();
        expect(localStorage.getItem(AI_STUDY_STORAGE_KEY)).toBeNull();expect(requestStudyAi).not.toHaveBeenCalled();
    });
    it("reloads a restored conversation after flushing dirty memory and never writes the old conversation back",async()=>{
        render(<StudyAiChat {...props}/>);await open();
        const failure=vi.spyOn(Storage.prototype,"setItem").mockImplementation(()=>{throw new Error("저장 실패");});
        fireEvent.change(screen.getByLabelText("메시지"),{target:{value:"OLD_UNSAVED"}});fireEvent.click(screen.getByRole("button",{name:"전송"}));await screen.findByRole("button",{name:"저장 재시도"});failure.mockRestore();
        await act(async()=>{window.dispatchEvent(new CustomEvent("ai-study-maintenance",{detail:true}));await flushAiStudyWrites();
            localStorage.setItem(AI_STUDY_STORAGE_KEY,JSON.stringify({version:1,conversations:[{id:"restored",title:"복원 대화",contextId:"restored-ctx",updatedAt:"2026-01-01",materials:[],sharing:DEFAULT_AI_SHARING,messages:[{id:"b",role:"user",text:"B",contextId:"restored-ctx",status:"complete"},{id:"b-answer",role:"assistant",text:"B response",contextId:"restored-ctx",status:"complete"}]}]}));window.dispatchEvent(new CustomEvent("ai-study-maintenance",{detail:false}));});
        await screen.findByText("B response");await send("C");
        const persisted=localStorage.getItem(AI_STUDY_STORAGE_KEY)!;expect(persisted).not.toContain("OLD_UNSAVED");expect(JSON.parse(persisted).conversations[0].messages.filter((m:{role:string})=>m.role==="user").map((m:{text:string})=>m.text)).toEqual(["B","C"]);
    });
    it("keeps successful context and permits an explicitly new identical question",async()=>{
        render(<StudyAiChat {...props}/>);await open();await send("같은 질문");
        expect(screen.getByRole("button",{name:"마지막 질문 재시도"})).toBeDisabled();
        await send("같은 질문");
        expect(vi.mocked(requestStudyAi).mock.calls[1][0].messages).toEqual([{role:"user",text:"같은 질문"},{role:"assistant",text:"AI 답변"},{role:"user",text:"같은 질문"}]);
    });
    it("stops a stream, ignores its late completion, and retries the same turn after restart",async()=>{
        let finish!:(text:string)=>void;let delta!: (text:string)=>void;
        vi.mocked(requestStudyAi).mockImplementationOnce((_request,_signal,onDelta)=>{delta=onDelta!;return new Promise(resolve=>{finish=resolve;});});
        const view=render(<StudyAiChat {...props}/>);await open();
        fireEvent.change(screen.getByLabelText("메시지"),{target:{value:"중지 질문"}});fireEvent.click(screen.getByRole("button",{name:"전송"}));
        await waitFor(()=>expect(requestStudyAi).toHaveBeenCalledTimes(1));act(()=>delta("일부 응답"));fireEvent.click(screen.getByRole("button",{name:"응답 중지"}));
        await act(async()=>{delta("LATE_DELTA");finish("LATE_COMPLETE");});
        await waitFor(()=>expect(screen.getByText(/중지 · 다음 요청/)).toBeInTheDocument());
        expect(localStorage.getItem(AI_STUDY_STORAGE_KEY)).not.toContain("LATE_");view.unmount();
        render(<StudyAiChat {...props}/>);await open();
        const retry=screen.getByRole("button",{name:"마지막 질문 재시도"});fireEvent.click(retry);fireEvent.click(retry);
        await waitFor(()=>expect(requestStudyAi).toHaveBeenCalledTimes(2));
        expect(vi.mocked(requestStudyAi).mock.calls[1][0].messages).toEqual([{role:"user",text:"중지 질문"}]);
    });
    it("keeps input and dirty records on save failure and retries without duplicate questions",async()=>{
        render(<StudyAiChat {...props}/>);await open();
        const failure=vi.spyOn(Storage.prototype,"setItem").mockImplementation(()=>{throw new Error("저장 장치 실패");});
        fireEvent.change(screen.getByLabelText("메시지"),{target:{value:"보존 질문"}});fireEvent.click(screen.getByRole("button",{name:"전송"}));
        await screen.findByRole("button",{name:"저장 재시도"});expect(screen.getByLabelText("메시지")).toHaveValue("보존 질문");expect(requestStudyAi).not.toHaveBeenCalled();
        failure.mockRestore();fireEvent.click(screen.getByRole("button",{name:"저장 재시도"}));
        await waitFor(()=>expect(screen.queryByRole("button",{name:"저장 재시도"})).not.toBeInTheDocument());
        fireEvent.click(screen.getByRole("button",{name:"전송"}));await screen.findByText("AI 답변");
        expect(vi.mocked(requestStudyAi).mock.calls[0][0].messages).toEqual([{role:"user",text:"보존 질문"}]);
        expect(JSON.parse(localStorage.getItem(AI_STUDY_STORAGE_KEY)!).conversations[0].messages.filter((m:{role:string})=>m.role==="user")).toHaveLength(1);
    });
    it("does not retry a failed question after its attachment scope changes",async()=>{
        vi.mocked(requestStudyAi).mockRejectedValueOnce(new Error("실패"));render(<StudyAiChat {...props}/>);await open();
        fireEvent.change(screen.getByLabelText("메시지"),{target:{value:"이전 문맥"}});fireEvent.click(screen.getByRole("button",{name:"전송"}));await screen.findByText("실패");
        fireEvent.click(screen.getByRole("button",{name:"현재 문항 추가"}));await waitFor(()=>expect(screen.getByText(/AI가 볼 자료: 1문항 · 본문/)).toBeInTheDocument());
        expect(screen.getByRole("button",{name:"마지막 질문 재시도"})).toBeDisabled();expect(requestStudyAi).toHaveBeenCalledTimes(1);
    });
    it("retries the stored failed question once without appending another user message", async () => {
        vi.mocked(requestStudyAi).mockRejectedValueOnce(new Error("요청 실패"));
        render(<StudyAiChat {...props}/>);
        await open();
        fireEvent.change(screen.getByLabelText("메시지"), { target: { value: "실패 질문" } });
        fireEvent.click(screen.getByRole("button", { name: "전송" }));
        await screen.findByText("요청 실패");
        fireEvent.click(screen.getByRole("button", { name: "마지막 질문 재시도" }));
        await waitFor(() => expect(requestStudyAi).toHaveBeenCalledTimes(2));
        expect(vi.mocked(requestStudyAi).mock.calls[1][0].messages).toEqual([{ role: "user", text: "실패 질문" }]);
        const saved = JSON.parse(localStorage.getItem(AI_STUDY_STORAGE_KEY)!);
        expect(saved.conversations[0].messages.filter((m: { role: string }) => m.role === "user")).toHaveLength(1);
    });
    it("contains keyboard focus only in the compact modal and restores background access and the opener", async () => {
        let compact = true;
        let notify = () => {};
        vi.stubGlobal("matchMedia", vi.fn(() => ({ get matches() { return compact; }, addEventListener: (_: string, fn: () => void) => { notify = fn; }, removeEventListener: vi.fn() })));
        const rectangles = vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList);
        try {
            const { container } = render(<><button>배경 조작</button><StudyAiChat {...props}/></>);
            await open();
            const panel = screen.getByRole("dialog", { name: "AI 학습 대화" });
            expect(panel).toHaveAttribute("aria-modal", "true");
            expect(container).toHaveProperty("inert", true);
            fireEvent.change(screen.getByLabelText("메시지"), { target: { value: "보내기 전 문장" } });
            const sendButton = screen.getByRole("button", { name: "전송" });
            const first = screen.getByRole("button", { name: "API 설정" });
            sendButton.focus();
            fireEvent.keyDown(sendButton, { key: "Tab" });
            expect(first).toHaveFocus();
            fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
            expect(sendButton).toHaveFocus();
            screen.getByText("배경 조작").focus();
            expect(first).toHaveFocus();
            act(() => { compact = false; notify(); });
            expect(panel).toHaveAttribute("aria-modal", "false");
            expect(container.inert).not.toBe(true);
            screen.getByText("배경 조작").focus();
            expect(screen.getByText("배경 조작")).toHaveFocus();
            act(() => { compact = true; notify(); });
            fireEvent.keyDown(first, { key: "Escape" });
            expect(screen.queryByRole("dialog", { name: "AI 학습 대화" })).not.toBeInTheDocument();
            expect(container.inert).not.toBe(true);
            expect(screen.getByRole("button", { name: "AI 학습 대화 열기" })).toHaveFocus();
            expect(requestStudyAi).not.toHaveBeenCalled();
        } finally {
            rectangles.mockRestore();
            vi.unstubAllGlobals();
        }
    });
    it("starts without materials and does not call the provider by opening, selecting, or saving locally", async () => {
        render(<StudyAiChat {...props}/>);
        await open();
        expect(screen.getByText(/AI가 볼 자료: 0문항/)).toBeInTheDocument();
        expect(requestStudyAi).not.toHaveBeenCalled();
        await send("안녕");
        expect(requestStudyAi).toHaveBeenCalledTimes(1);
        const request = vi.mocked(requestStudyAi).mock.calls[0][0];
        expect(request.context).toBe("[]");
        expect(request.images).toEqual([]);
        expect(JSON.stringify(request)).not.toContain("ANSWER_SECRET");
        expect(JSON.parse(localStorage.getItem(AI_STUDY_STORAGE_KEY)!).conversations[0].messages).toHaveLength(2);
    });
    it("adds only the explicit current question, gates solutions, and drops prior history after option changes", async () => {
        render(<StudyAiChat {...props}/>);
        await open();
        fireEvent.click(screen.getByRole("button", { name: "현재 문항 추가" }));
        await waitFor(() => expect(screen.getByText(/AI가 볼 자료: 1문항 · 본문/)).toBeInTheDocument());
        fireEvent.click(screen.getByText(/범위 설정/));
        fireEvent.click(screen.getByLabelText("정답", { exact: true }));
        await waitFor(()=>expect(screen.getByLabelText("해설",{exact:true})).toBeEnabled());
        fireEvent.click(screen.getByLabelText("해설", { exact: true }));
        await waitFor(() => expect(screen.getByLabelText("해설", { exact: true })).toBeChecked());
        await send("첫 질문");
        const first = vi.mocked(requestStudyAi).mock.calls[0][0];
        expect(first.context).toContain("ANSWER_SECRET");
        expect(first.context).toContain("EXPLANATION_SECRET");
        fireEvent.click(screen.getByLabelText("정답", { exact: true }));
        await waitFor(() => expect(screen.getByLabelText("정답", { exact: true })).not.toBeChecked());
        fireEvent.click(screen.getByLabelText("해설", { exact: true }));
        await waitFor(() => expect(screen.getByLabelText("해설", { exact: true })).not.toBeChecked());
        await send("둘째 질문");
        const second = vi.mocked(requestStudyAi).mock.calls[1][0];
        expect(second.context).not.toContain("ANSWER_SECRET");
        expect(second.context).not.toContain("EXPLANATION_SECRET");
        expect(second.messages).toEqual([{ role: "user", text: "둘째 질문" }]);
    });
    it("blocks actual real-exam sources while letting empty free conversation remain available", async () => {
        const session = { id: "s", entryId: entry.id, title: entry.title, mode: "real", status: "in_progress", questions: [], currentQuestionIndex: 0, responses: [] } as unknown as ExamSession;
        render(<StudyAiChat {...props} session={session}/>);
        await open();
        expect(screen.getByRole("button", { name: "현재 문항 추가" })).toBeDisabled();
        await send("일반 대화");
        expect(vi.mocked(requestStudyAi).mock.calls[0][0].context).toBe("[]");
    });
    it("preserves corrupt local records and blocks new writes until reload succeeds", async () => {
        localStorage.setItem(AI_STUDY_STORAGE_KEY, "{broken");
        render(<StudyAiChat {...props}/>);
        await open();
        expect(screen.getByRole("alert")).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("메시지"), { target: { value: "새 질문" } });
        expect(screen.getByRole("button", { name: "전송" })).toBeDisabled();
        expect(localStorage.getItem(AI_STUDY_STORAGE_KEY)).toBe("{broken");
    });
    it("ignores a late completion after maintenance invalidates the request", async () => {
        let finish!: (text: string) => void;
        vi.mocked(requestStudyAi).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        render(<StudyAiChat {...props}/>);
        await open();
        fireEvent.change(screen.getByLabelText("메시지"), { target: { value: "지연 질문" } });
        fireEvent.click(screen.getByRole("button", { name: "전송" }));
        await waitFor(() => expect(requestStudyAi).toHaveBeenCalled());
        act(() => { window.dispatchEvent(new CustomEvent("ai-study-maintenance", { detail: true })); });
        await act(async () => { finish("LATE_PRIVATE_REPLY"); });
        expect(localStorage.getItem(AI_STUDY_STORAGE_KEY)).not.toContain("LATE_PRIVATE_REPLY");
    });
    it("closes the composer and chat after saving and starting the reviewed exam",async()=>{
      const materials=entryAiMaterials(entry);const config:AiExamConfig={title:"시험",subject:"수학",count:1,minutes:30,points:5,maxPerSource:1,easy:0,medium:0,hard:0,unitCounts:{},prioritizeImportance:true,instruction:""};
      const proposal=proposalFromSelection(JSON.stringify({summary:"구성",questions:[{id:materials[0].id,points:5,reason:"선정"}]}),materials,config);
      localStorage.setItem(AI_STUDY_STORAGE_KEY,JSON.stringify({version:1,conversations:[{id:"compose-chat",title:"구성 대화",contextId:"ctx",updatedAt:new Date().toISOString(),sharing:DEFAULT_AI_SHARING,materials,messages:[],proposal}],drafts:[{id:"conversation:compose-chat",materials,sharing:DEFAULT_AI_SHARING,config,proposal,excluded:[],template:"free"}]}));
      const onStart=vi.fn().mockResolvedValue(undefined);const onSave=vi.fn().mockResolvedValue(undefined);
      render(<StudyAiChat {...props} onStartExam={onStart} onSaveExam={onSave}/>);await open();fireEvent.click(screen.getByRole("button",{name:"AI 구성안 만들기 · 초안 이어서"}));
      await waitFor(()=>expect(screen.getByRole("button",{name:"저장하고 풀기"})).toBeEnabled());fireEvent.click(screen.getByRole("button",{name:"저장하고 풀기"}));
      await waitFor(()=>expect(onStart).toHaveBeenCalledTimes(1));expect(onSave).toHaveBeenCalledTimes(1);await waitFor(()=>expect(screen.queryByRole("dialog",{name:"AI 모의고사 구성"})).not.toBeInTheDocument());expect(screen.queryByRole("dialog",{name:"AI 학습 대화"})).not.toBeInTheDocument();
    });

});
