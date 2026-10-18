import { entryAiMaterials, DEFAULT_AI_SHARING } from "./model";
import { proposalFromSelection, type AiExamConfig } from "./examProposal";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamSession, WrongAnswerEntry } from "../../types";
import StudyAiChat from "./StudyAiChat";
import { requestStudyAi } from "./api";
import { AI_STUDY_STORAGE_KEY } from "./model";
vi.mock("./api", () => ({ requestStudyAi: vi.fn(async () => "AI 답변") }));
vi.mock("../../shared/ui/AppDialogProvider", () => ({ useAppDialog: () => ({ confirm: async () => true, prompt: async () => "바뀐 이름" }) }));
const entry = { id: "entry", title: "원본 시험지", subject: "수학", entryKind: "problem_sheet", question: "1. 문제 본문\n① A\n② B", tags: [], questionImages: [], memo: "PRIVATE_MEMO", answerKey: [{ id: "a", questionNumber: "1", answer: "ANSWER_SECRET", explanation: "EXPLANATION_SECRET", importantPoints: [] }], questionMeta: [], createdAt: "2026-01-01", updatedAt: "2026-01-01", explanationParts: [], annotations: [], difficulty: "medium", difficult: false, mastered: false, myAnswer: "", correctAnswer: "" } as WrongAnswerEntry;
const props = { entries: [entry], selectedEntryId: entry.id, session: null, onSaveExam: vi.fn(), onStartExam: vi.fn(), onSettings: vi.fn() };
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() }); });
afterEach(() => localStorage.clear());
async function open() { fireEvent.click(screen.getByRole("button", { name: "AI 학습 대화 열기" })); await waitFor(() => expect(screen.queryByText("대화 불러오는 중…")).not.toBeInTheDocument()); }
async function send(text: string) { fireEvent.change(screen.getByLabelText("메시지"), { target: { value: text } }); fireEvent.click(screen.getByRole("button", { name: "전송" })); await waitFor(() => expect(screen.getAllByText("AI 답변").length).toBeGreaterThan(0)); }
describe("study AI chat integration", () => {
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
