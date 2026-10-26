import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Dialog from "../shared/ui/Dialog";
import { AppDialogProvider, useAppDialog } from "../shared/ui/AppDialogProvider";
import MathText from "../components/MathText";
import ZoomableImageViewer from "../components/ZoomableImageViewer";
import StructuredQuestionReviewEditor from "../features/import/components/StructuredQuestionReviewEditor";
import LearningHubView from "../features/learning/components/LearningHubView";
import QuestionBankView from "../features/question-bank/components/QuestionBankView";
import GeneratedExamList from "../features/exam-builder/components/GeneratedExamList";
import type { StructuredQuestion } from "../types";

const mocks = vi.hoisted(() => ({ image: vi.fn() }));
vi.mock("../api", () => ({ getImageUrl: mocks.image }));

describe("UI integrity follow-up", () => {
  it("allocates painting and focus order when a pre-mounted dialog actually opens", () => {
    const view = render(<><Dialog open={false} onClose={vi.fn()} title="미리 준비한 창">내용</Dialog><Dialog open onClose={vi.fn()} title="해설"><button>해설 작업</button></Dialog></>);
    view.rerender(<><Dialog open onClose={vi.fn()} title="미리 준비한 창"><button>확대 작업</button></Dialog><Dialog open onClose={vi.fn()} title="해설"><button>해설 작업</button></Dialog></>);
    const zoom = screen.getByRole("dialog", { name: "미리 준비한 창" });
    const solution = document.querySelector('[role="dialog"][aria-labelledby] [id]')?.closest('[role="dialog"]');
    expect(Number(zoom.parentElement!.style.zIndex)).toBeGreaterThan(2000);
    const hidden = document.querySelector('[role="dialog"][aria-hidden="true"]') as HTMLElement;
    expect(hidden).toHaveProperty("inert", true);
    expect(Number(zoom.parentElement!.style.zIndex)).toBeGreaterThan(Number(hidden.parentElement!.style.zIndex));
    expect(solution).not.toBeNull();
  });

  it("keeps a Korean composition Enter in the prompt until explicit confirmation", async () => {
    const result = vi.fn();
    function Consumer() { const { prompt } = useAppDialog(); return <button onClick={() => void prompt({ title: "이름", message: "이름 입력" }).then(result)}>이름 입력 열기</button>; }
    render(<AppDialogProvider><Consumer /></AppDialogProvider>);
    fireEvent.click(screen.getByRole("button", { name: "이름 입력 열기" }));
    const input = screen.getByRole("textbox", { name: "이름" });
    fireEvent.change(input, { target: { value: "미분" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true, keyCode: 229 });
    expect(screen.getByRole("dialog", { name: "이름" })).toBeInTheDocument();
    expect(result).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter", isComposing: false, keyCode: 13 });
    await waitFor(() => expect(result).toHaveBeenCalledWith("미분"));
  });

  it("retains both malformed and unsupported formula source alongside warnings", () => {
    const { container } = render(<MathText text={String.raw`앞 $\unknown{x}$ 뒤 $$y^2`} />);
    expect(container).toHaveTextContent(String.raw`$\unknown{x}$`);
    expect(container).toHaveTextContent("$$y^2");
    expect(container).toHaveTextContent("앞");
    expect(container).toHaveTextContent("뒤");
    expect(screen.getAllByText("수식 형식 확인 필요")).toHaveLength(2);
  });

  it("passes the exact clicked formula range to the import editor", () => {
    const onEditError = vi.fn();
    const formula = String.raw`$\unknown{x}$`;
    render(<MathText text={`앞 ${formula} 뒤 ${formula}`} onEditError={onEditError} />);
    fireEvent.click(screen.getAllByRole("button", { name: "수식 수정" })[1]);
    const start = 2 + formula.length + 3;
    expect(onEditError).toHaveBeenCalledWith(start, start + formula.length);
  });

  it("shows an image read failure, retries, and keeps the fullscreen close action available", async () => {
    mocks.image.mockReset().mockRejectedValueOnce(new Error("missing")).mockResolvedValue("blob:diagram");
    render(<ZoomableImageViewer filenames={["figure.png"]} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("연결은 유지");
    fireEvent.click(screen.getByRole("button", { name: "이미지 다시 불러오기" }));
    fireEvent.click(await screen.findByRole("button", { name: /첨부 이미지 1/ }));
    const dialog = screen.getByRole("dialog", { name: "이미지 확대 보기" });
    expect(dialog).toHaveClass("dialog-scroll-custom");
    fireEvent.error(screen.getByRole("img", { name: "확대 이미지 1" }));
    expect(screen.getByText("이미지 표시 중 오류가 발생했습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("mounts one editor out of 30 and edits the selected last question only", () => {
    const questions: StructuredQuestion[] = Array.from({ length: 30 }, (_, i) => ({ questionNumber: String(i + 1), questionText: `본문 ${i + 1}`, conditions: [], equations: [], figureIds: [], contentSegments: [{ id: `t-${i}`, type: "text", text: `본문 ${i + 1}` }], choices: ["① 1"] }));
    const onChange = vi.fn();
    render(<StructuredQuestionReviewEditor questions={questions} onChange={onChange} />);
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.queryByDisplayValue("본문 30")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "편집할 문항" }), { target: { value: "29" } });
    expect(screen.getByDisplayValue("본문 30")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "30번 선택지 추가" }));
    const changed = onChange.mock.calls[0][0] as StructuredQuestion[];
    expect(changed[0].choices).toEqual(["① 1"]);
    expect(changed[29].choices).toEqual(["① 1", "② "]);
    expect(screen.getByRole("button", { name: "다음 문항" })).toBeDisabled();
  });

  it("offers import instead of a dead source button when learning has no materials", () => {
    const onImport = vi.fn();
    render(<LearningHubView entries={[]} onOpenSource={vi.fn()} onOpenCandidateReview={vi.fn()} onUpdateBlock={vi.fn()} onDuplicateBlock={vi.fn()} onDeleteBlock={vi.fn()} onOpenImport={onImport} />);
    expect(screen.queryByRole("button", { name: "학습 후보 만들기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "시험지 열기" })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "시험지 가져오기" }).at(-1)!);
    expect(onImport).toHaveBeenCalledOnce();
  });

  it("distinguishes an empty bank and links to the import action", () => {
    const onImport = vi.fn();
    render(<QuestionBankView entries={[]} onOpenQuestion={vi.fn()} onOpenImport={onImport} />);
    expect(screen.getByText("아직 등록된 문항이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "필터 초기화" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "시험지 가져오기" }));
    expect(onImport).toHaveBeenCalledOnce();
  });

  it("links an empty saved exam list to composition", () => {
    const onCreate = vi.fn();
    render(<GeneratedExamList exams={[]} onOpen={vi.fn()} onDelete={vi.fn()} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: "모의고사 만들기" }));
    expect(onCreate).toHaveBeenCalledOnce();
  });
});
