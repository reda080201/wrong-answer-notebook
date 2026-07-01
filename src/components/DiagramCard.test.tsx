import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DiagramCard from "./DiagramCard";

describe("DiagramCard", () => {
  it("renders supported diagram types", () => {
    const { rerender } = render(<DiagramCard diagramType="derivative-tangent" />);
    expect(screen.getByRole("figure", { name: "미분계수와 접선 다이어그램" })).toBeInTheDocument();

    rerender(<DiagramCard diagramType="absolute-value-corner" />);
    expect(screen.getByRole("figure", { name: "절댓값 뾰족점 다이어그램" })).toBeInTheDocument();

    rerender(<DiagramCard diagramType="piecewise-differentiability" />);
    expect(screen.getByRole("figure", { name: "구간별 미분가능성 다이어그램" })).toBeInTheDocument();
  });

  it("does not render unsupported diagram types", () => {
    const { container } = render(<DiagramCard diagramType="raw-svg" />);

    expect(container.firstChild).toBeNull();
  });

  it("renders diagramSpec labels before diagramType fallback", () => {
    render(
      <DiagramCard
        diagramType="absolute-value-corner"
        diagramSpec={{
          type: "derivative-tangent",
          title: "사용자 지정 접선",
          pointLabel: "x=2",
          functionLabel: "y=x^2",
          tangentLabel: "접선 L",
          slopeLabel: "기울기 4",
          highlights: ["순간변화율 확인"],
        }}
      />,
    );

    expect(screen.getByRole("figure", { name: "사용자 지정 접선 다이어그램" })).toBeInTheDocument();
    expect(screen.getByText("x=2")).toBeInTheDocument();
    expect(screen.getByText("y=x^2")).toBeInTheDocument();
    expect(screen.getByText("접선 L")).toBeInTheDocument();
    expect(screen.getByText("기울기 4")).toBeInTheDocument();
    expect(screen.getByText("순간변화율 확인")).toBeInTheDocument();
    expect(screen.queryByText("절댓값 뾰족점")).not.toBeInTheDocument();
  });
});
