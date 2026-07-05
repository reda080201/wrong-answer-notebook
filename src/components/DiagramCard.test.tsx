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

    rerender(<DiagramCard diagramType="coordinate-graph" />);
    expect(screen.getByRole("figure", { name: "좌표 그래프 다이어그램" })).toBeInTheDocument();

    rerender(<DiagramCard diagramType="normal-distribution" />);
    expect(screen.getByRole("figure", { name: "정규분포 다이어그램" })).toBeInTheDocument();

    rerender(<DiagramCard diagramType="probability-tree" />);
    expect(screen.getByRole("figure", { name: "확률나무 다이어그램" })).toBeInTheDocument();

    rerender(<DiagramCard diagramType="venn-diagram" />);
    expect(screen.getByRole("figure", { name: "벤 다이어그램 다이어그램" })).toBeInTheDocument();

    rerender(<DiagramCard diagramType="geometry-helper" />);
    expect(screen.getByRole("figure", { name: "기하 보조선 다이어그램" })).toBeInTheDocument();

    rerender(<DiagramCard diagramType="trig-unit-circle" />);
    expect(screen.getByRole("figure", { name: "삼각함수 단위원 다이어그램" })).toBeInTheDocument();

    rerender(<DiagramCard diagramType="sequence-flow" />);
    expect(screen.getByRole("figure", { name: "수열 흐름 다이어그램" })).toBeInTheDocument();
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

  it("renders labels for extended diagram specs", () => {
    render(
      <DiagramCard
        diagramSpec={{
          type: "coordinate-graph",
          title: "교점 그래프",
          curveLabel: "y=g(x)",
          pointLabels: ["교점", "절편"],
          interceptLabel: "x절편",
          highlights: ["좌표축과 교점 확인"],
        }}
      />,
    );

    expect(screen.getByRole("figure", { name: "교점 그래프 다이어그램" })).toBeInTheDocument();
    expect(screen.getByText("y=g(x)")).toBeInTheDocument();
    expect(screen.getByText("교점")).toBeInTheDocument();
    expect(screen.getByText("x절편")).toBeInTheDocument();
    expect(screen.getByText("좌표축과 교점 확인")).toBeInTheDocument();
  });

  it("renders safe diagramSpec params as supporting text", () => {
    render(
      <DiagramCard
        diagramSpec={{
          type: "geometry-helper",
          title: "원과 직선",
          params: {
            coreIdea: "수평현 길이를 x좌표 차로 바꾼다",
            objects: [
              { type: "circle", equation: "x^2+y^2=4", label: "원" },
              { type: "line", equation: "y=tx+t", label: "직선" },
            ],
            highlight: ["PR", "QS"],
          },
        }}
      />,
    );

    expect(screen.getByRole("figure", { name: "원과 직선 다이어그램" })).toBeInTheDocument();
    expect(screen.getByText("수평현 길이를 x좌표 차로 바꾼다")).toBeInTheDocument();
    expect(screen.getByText(/label: 원/)).toBeInTheDocument();
    expect(screen.getByText("PR")).toBeInTheDocument();
  });
});
