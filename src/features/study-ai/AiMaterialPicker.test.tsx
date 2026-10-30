import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AiMaterial, AiSharing } from "./model";
import AiMaterialPicker from "./AiMaterialPicker";

const sharing: AiSharing = { body: true, choices: true, images: false, answers: false, explanations: false, memo: false, learning: false };
const materials = [1, 2, 3].map((number) => ({
  id: `material-${number}`,
  source: { sourceEntryId: number < 3 ? "group-a" : "group-b", sourceEntryTitle: number < 3 ? "대수 문제지" : "기하 문제지", sourceQuestionNumber: String(number) },
  snapshot: { questionNumber: String(number), question: `핵심내용 ${number}`, choices: [], figures: [] },
  units: [],
})) as unknown as AiMaterial[];

describe("AiMaterialPicker", () => {
  it("adds all search matches without dropping other attachments or duplicating a match", () => {
    const onChange = vi.fn();
    const { rerender } = render(<AiMaterialPicker available={materials} selected={[materials[2], materials[1]]} sharing={sharing} onChange={onChange} />);
    fireEvent.click(screen.getByText(/AI가 볼 자료/));
    fireEvent.change(screen.getByLabelText("AI 첨부 자료 검색"), { target: { value: "핵심내용 2" } });
    expect(screen.queryByRole("button", { name: /전체 문제은행 선택/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "검색 결과 추가 (1문항)" }));
    expect(onChange).toHaveBeenLastCalledWith([materials[2], materials[1]], sharing);
    rerender(<AiMaterialPicker available={materials} selected={[materials[2], materials[1]]} sharing={sharing} onChange={onChange} disabled />);
    expect(screen.getByRole("button", { name: "검색 결과 추가 (1문항)" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("AI 첨부 자료 검색"), { target: { value: "결과 없음" } });
    expect(screen.getByRole("button", { name: "검색 결과 추가 (0문항)" })).toBeDisabled();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("requires the explicit secondary menu to add a whole group outside the search", () => {
    const onChange = vi.fn();
    render(<AiMaterialPicker available={materials} selected={[materials[2]]} sharing={sharing} onChange={onChange} />);
    fireEvent.click(screen.getByText(/AI가 볼 자료/));
    fireEvent.change(screen.getByLabelText("AI 첨부 자료 검색"), { target: { value: "핵심내용 2" } });
    fireEvent.click(screen.getByText(/대수 문제지 · 1문항/));
    expect(screen.queryByRole("button", { name: /전체 묶음 추가 \(/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "대수 문제지 검색과 무관한 전체 묶음 추가" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "전체 묶음 추가 (2문항 · 검색과 무관)" }));
    expect(onChange).toHaveBeenCalledWith([materials[2], materials[0], materials[1]], sharing);
    fireEvent.click(screen.getByRole("button", { name: "검색과 무관한 전체 자료 추가" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "전체 문제은행 추가 (3문항 · 검색과 무관)" }));
    expect(onChange).toHaveBeenLastCalledWith(materials, sharing);
  });
  it("filters groups and separates whole-group from matching-question additions", () => {
    const onChange = vi.fn();
    render(<AiMaterialPicker available={materials} selected={[]} sharing={sharing} onChange={onChange} />);
    const picker = screen.getByText(/AI가 볼 자료/).closest("details")!;
    fireEvent.click(screen.getByText(/AI가 볼 자료/));
    fireEvent.click(screen.getByLabelText("AI 첨부 자료 검색"));
    fireEvent.change(screen.getByLabelText("AI 첨부 자료 검색"), { target: { value: "핵심내용 2" } });
    expect(within(picker).getByText(/대수 문제지 · 1문항/)).toBeInTheDocument();
    expect(within(picker).queryByText(/기하 문제지/)).not.toBeInTheDocument();
    fireEvent.click(within(picker).getByText(/대수 문제지 · 1문항/));
    fireEvent.click(within(picker).getByRole("button", { name: "검색된 문항 추가 (1)" }));
    expect(onChange).toHaveBeenCalledWith([materials[1]], sharing);
    fireEvent.change(within(picker).getByLabelText("AI 첨부 자료 검색"), { target: { value: "없는 검색어" } });
    expect(within(picker).getByRole("status")).toHaveTextContent("검색 결과가 없습니다.");
    fireEvent.click(within(picker).getByRole("button", { name: /검색 초기화/ }));
    expect(within(picker).getByText(/기하 문제지 · 1문항/)).toBeInTheDocument();
    fireEvent.click(within(picker).getByRole("button", { name: "전체 묶음 추가 (2)" }));
    expect(onChange).toHaveBeenLastCalledWith(materials.slice(0, 2), sharing);
  });
});
