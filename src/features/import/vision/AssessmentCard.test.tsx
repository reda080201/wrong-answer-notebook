import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import cases from "../../../../tools/diagram_pipeline/tests/fixtures/vision-v2-cases.json";
import type { QuestionMeta, SheetAnswerItem } from "../../../types";
import { mapVisionAssessment } from "./assessmentMapping";
import { parseVisionAnalysis } from "./visionSchema";
import AssessmentCard from "./AssessmentCard";

function mappedAssessment() {
  const source = cases.find(item => item.valid);
  if (!source) throw new Error("vision-v2 fixture missing valid case");
  const question = parseVisionAnalysis(source.text).entries[0].questions[0];
  const mapped = mapVisionAssessment(question, "fixture-answer", "2026-10-28T00:00:00Z");
  if (!mapped.meta || !mapped.answer) throw new Error("fixture assessment missing");
  return { meta: mapped.meta, answer: mapped.answer };
}

describe("AssessmentCard input synchronization", () => {
  it("keeps only dirty fields, surfaces prop conflicts, applies latest values, and resets when the question changes", () => {
    const { meta: initialMeta, answer: initialAnswer } = mappedAssessment();
    const meta = { ...initialMeta, difficultyScore: 40, rating: { ...initialMeta.rating, importanceScore: 60 } };
    const answer: SheetAnswerItem = { ...initialAnswer, answer: "초기 답", needsReview: true };
    const onMetaChange = vi.fn<(value: QuestionMeta) => void>();
    const onAnswerChange = vi.fn<(value: SheetAnswerItem) => void>();
    const view = render(<AssessmentCard meta={meta} answer={answer} onMetaChange={onMetaChange} onAnswerChange={onAnswerChange} />);
    fireEvent.click(screen.getByText("점수 직접 수정"));
    fireEvent.change(screen.getByLabelText("수동 난이도"), { target: { value: "45" } });

    const externalMeta = { ...meta, difficultyScore: 50, rating: { ...meta.rating, importanceScore: 70 } };
    view.rerender(<AssessmentCard meta={externalMeta} answer={{ ...answer, answer: "최신 답" }} onMetaChange={onMetaChange} onAnswerChange={onAnswerChange} />);
    expect(screen.getByLabelText("수동 난이도")).toHaveValue(45);
    expect(screen.getByLabelText("수동 중요도")).toHaveValue(70);
    expect(screen.getByText(/난이도 값이 외부에서 변경/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByText("최신값 불러오기")[0]);
    expect(screen.getByLabelText("수동 난이도")).toHaveValue(50);
    fireEvent.change(screen.getByLabelText("수동 난이도"), { target: { value: "55" } });
    fireEvent.click(screen.getByText("수동 점수 적용"));
    expect(onMetaChange).toHaveBeenLastCalledWith(expect.objectContaining({ difficultyScore: 55, rating: expect.objectContaining({ importanceScore: 70 }) }));

    const changedQuestion = { ...externalMeta, questionNumber: `${externalMeta.questionNumber}-next`, difficultyScore: 22 };
    view.rerender(<AssessmentCard meta={changedQuestion} answer={{ ...answer, answer: "다음 답" }} onMetaChange={onMetaChange} onAnswerChange={onAnswerChange} />);
    expect(screen.getByLabelText("수동 난이도")).toHaveValue(22);
    expect(screen.getByLabelText("수동 중요도")).toHaveValue(70);
    expect(screen.queryByText(/값이 외부에서 변경/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("확인할 정답")).toHaveValue("다음 답");
  });

  it("preserves an AI-applied score and requires an explicit choice before confirming a changed answer", () => {
    const { meta: sourceMeta, answer: sourceAnswer } = mappedAssessment();
    const initialMeta = { ...sourceMeta, difficultyScore: 30, rating: { ...sourceMeta.rating, importanceScore: 60 } };
    const initialAnswer: SheetAnswerItem = { ...sourceAnswer, answer: "기존 답", needsReview: true };
    let currentMeta: QuestionMeta = initialMeta;
    const onMetaChange = vi.fn((next: QuestionMeta) => { currentMeta = next; });
    const onAnswerChange = vi.fn<(value: SheetAnswerItem) => void>();
    const view = render(<AssessmentCard meta={currentMeta} answer={initialAnswer} onMetaChange={onMetaChange} onAnswerChange={onAnswerChange} />);
    fireEvent.click(screen.getByText("보존된 AI 평가 적용"));
    fireEvent.click(screen.getByLabelText("AI 난이도 적용"));
    fireEvent.click(screen.getByText("선택한 점수 적용"));
    expect(onMetaChange).toHaveBeenLastCalledWith(expect.objectContaining({ difficultyScore: sourceMeta.studyAssessment?.scores.difficulty.value }));

    view.rerender(<AssessmentCard meta={currentMeta} answer={initialAnswer} onMetaChange={onMetaChange} onAnswerChange={onAnswerChange} />);
    fireEvent.click(screen.getByText("점수 직접 수정"));
    fireEvent.change(screen.getByLabelText("수동 중요도"), { target: { value: "77" } });
    fireEvent.click(screen.getByText("수동 점수 적용"));
    expect(onMetaChange).toHaveBeenLastCalledWith(expect.objectContaining({ difficultyScore: sourceMeta.studyAssessment?.scores.difficulty.value, rating: expect.objectContaining({ importanceScore: 77 }) }));

    fireEvent.change(screen.getByLabelText("확인할 정답"), { target: { value: "내 답안" } });
    const changedAnswer = { ...initialAnswer, answer: "새 원문 답" };
    view.rerender(<AssessmentCard meta={currentMeta} answer={changedAnswer} onMetaChange={onMetaChange} onAnswerChange={onAnswerChange} />);
    expect(screen.getByText(/정답 값이 외부에서 변경/)).toBeInTheDocument();
    expect(screen.getByText("이 정답 확인")).toBeDisabled();
    fireEvent.click(screen.getByText("내 입력 적용"));
    expect(screen.getByText("이 정답 확인")).toBeEnabled();
    fireEvent.click(screen.getByText("이 정답 확인"));
    expect(onAnswerChange).toHaveBeenCalledWith(expect.objectContaining({ answer: "내 답안" }));
    const nextMeta = { ...currentMeta, questionNumber: `${currentMeta.questionNumber}-next`, difficultyScore: 12 };
    view.rerender(<AssessmentCard meta={nextMeta} answer={{ ...changedAnswer, answer: "다음 문항 답" }} onMetaChange={onMetaChange} onAnswerChange={onAnswerChange} />);
    expect(screen.getByLabelText("수동 난이도")).toHaveValue(12);
    expect(screen.getByLabelText("확인할 정답")).toHaveValue("다음 문항 답");
  });
});
