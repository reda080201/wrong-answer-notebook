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
