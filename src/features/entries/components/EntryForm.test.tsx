import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EntryForm from "./EntryForm";

vi.mock("../../../api", () => ({
  getImageUrl: vi.fn(),
  pickImages: vi.fn(),
  saveImageFiles: vi.fn(),
}));

describe("EntryForm", () => {
  it("explains why an empty form cannot be saved", () => {
    const onSave = vi.fn();
    render(<EntryForm onSave={onSave} onClose={vi.fn()} defaultEntryKind="wrong_answer" />);

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(screen.getByRole("alert")).toHaveTextContent("제목, 문제, 이미지 또는 학습 내용");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("recognizes a lecture with learning blocks as editable content", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <EntryForm
        onSave={onSave}
        onClose={vi.fn()}
        defaultEntryKind="lecture"
        initialData={{
          entryKind: "lecture",
          learningBlocks: [{ id: "block-1", type: "concept", title: "핵심", content: "정의" }],
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "특강 추가" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  it("keeps the form open and shows an error when save fails", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockRejectedValue(new Error("disk full"));

    render(
      <EntryForm
        onSave={onSave}
        onClose={onClose}
        defaultEntryKind="wrong_answer"
        prefilledTitle="저장 실패 테스트"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("disk full");
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("applies templates and cleans question text", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <EntryForm
        onSave={onSave}
        onClose={vi.fn()}
        defaultEntryKind="wrong_answer"
        templates={[
          {
            id: "template-1",
            name: "시험지 기본",
            entryKind: "problem_sheet",
            data: {
              title: "모의고사",
              question: "1. 문제  ① 답",
              subject: "국어",
              questionImages: [],
              explanationParts: [],
              annotations: [],
              tags: [],
              difficult: false,
              difficulty: "none",
              mastered: false,
            },
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByLabelText("템플릿"), {
      target: { value: "template-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "텍스트 정리" }));

    expect(screen.getByLabelText("제목")).toHaveValue("모의고사");
    expect(screen.getByLabelText("문제지 · 지문 (텍스트)")).toHaveValue("1. 문제\n① 답");
  });

  it("uses imported initial data as editable form values", () => {
    render(
      <EntryForm
        onSave={vi.fn()}
        onClose={vi.fn()}
        defaultEntryKind="problem_sheet"
        initialData={{
          entryKind: "problem_sheet",
          subject: "국어",
          title: "가져온 시험지",
          question: "1. 가져온 문제",
          tags: ["GPT변환", "시험지"],
          questionImages: ["img_imported.png"],
        }}
      />,
    );

    expect(screen.getByLabelText("제목")).toHaveValue("가져온 시험지");
    expect(screen.getByLabelText("문제지 · 지문 (텍스트)")).toHaveValue("1. 가져온 문제");
    expect(screen.getByText("#GPT변환")).toBeInTheDocument();
  });

  it("saves a manually edited difficulty score", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <EntryForm
        onSave={onSave}
        onClose={vi.fn()}
        defaultEntryKind="wrong_answer"
        prefilledTitle="난이도 점수 테스트"
      />,
    );

    fireEvent.change(screen.getByLabelText("문제 · 지문 (텍스트)"), {
      target: { value: "1. 점수 문제" },
    });
    fireEvent.change(screen.getByLabelText("난이도 점수 숫자 입력"), {
      target: { value: "82" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].difficultyScore).toBe(82);
  });

  it("fills and edits imported structured answer key values for problem sheets", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <EntryForm
        onSave={onSave}
        onClose={vi.fn()}
        defaultEntryKind="problem_sheet"
        initialData={{
          entryKind: "problem_sheet",
          title: "답안 포함 시험지",
          question: "1. 문제",
          answerKey: [
            {
              id: "answer-1",
              questionNumber: "1",
              answer: "③",
              explanation: "조건을 확인한다.",
              strategy: "조건을 먼저 본다",
              steps: ["조건 정리"],
              choiceJudgements: [{ marker: "①", text: "조건 불일치" }],
              wrongPoint: "부호 실수",
              reviewPoint: "부호 확인",
              importantPoints: ["보기 비교"],
            },
          ],
        }}
      />,
    );

    expect(screen.getByLabelText("문항 번호")).toHaveValue("1");
    expect(screen.getByLabelText("정답")).toHaveValue("③");
    expect(screen.getByLabelText("상세 풀이")).toHaveValue("조건을 확인한다.");
    expect(screen.getByLabelText("풀이 전략")).toHaveValue("조건을 먼저 본다");
    expect(screen.getByLabelText("풀이 단계")).toHaveValue("조건 정리");
    expect(screen.getByLabelText("보기별 판단")).toHaveValue("①: 조건 불일치");
    expect(screen.getByLabelText("오답 포인트")).toHaveValue("부호 실수");
    expect(screen.getByLabelText("다음 복습 포인트")).toHaveValue("부호 확인");
    expect(screen.getByLabelText("중요 포인트")).toHaveValue("보기 비교");

    fireEvent.change(screen.getByLabelText("정답"), { target: { value: "④" } });
    fireEvent.change(screen.getByLabelText("풀이 단계"), { target: { value: "조건 정리\n대입" } });

    expect(screen.getByLabelText("정답")).toHaveValue("④");
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].answerKey[0]).toEqual(
      expect.objectContaining({
        answer: "④",
        steps: ["조건 정리", "대입"],
        choiceJudgements: [{ marker: "①", text: "조건 불일치" }],
      }),
    );
  });

  it("clears all tags at once for problem sheets", () => {
    render(
      <EntryForm
        onSave={vi.fn()}
        onClose={vi.fn()}
        defaultEntryKind="problem_sheet"
        initialData={{
          entryKind: "problem_sheet",
          title: "태그 있는 시험지",
          question: "1. 문제",
          tags: ["중간고사", "함수"],
        }}
      />,
    );

    expect(screen.getByText("#중간고사")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "태그 전체 삭제" }));

    expect(screen.queryByText("#중간고사")).not.toBeInTheDocument();
    expect(screen.queryByText("#함수")).not.toBeInTheDocument();
  });
});
