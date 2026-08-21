import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FeatureErrorBoundary from "./FeatureErrorBoundary";

let shouldThrow = true;

function ThrowingFeature() {
  if (shouldThrow) {
    shouldThrow = false;
    throw new Error("feature failure");
  }
  return <p>정상 영역</p>;
}

describe("FeatureErrorBoundary", () => {
  it("contains a feature failure and retries the feature", () => {
    shouldThrow = true;
    render(
      <FeatureErrorBoundary featureName="개념 그래프">
        <ThrowingFeature />
      </FeatureErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("개념 그래프 영역을 표시하지 못했습니다.");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(screen.getByText("정상 영역")).toBeInTheDocument();
  });
});
