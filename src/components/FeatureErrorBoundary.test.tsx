import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import FeatureErrorBoundary from "./FeatureErrorBoundary";

function ThrowingFeature({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("feature failure");
  return <p>정상 영역</p>;
}

function RecoverableFeature() {
  const [shouldThrow, setShouldThrow] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setShouldThrow(false)}>원인 복구</button>
      <FeatureErrorBoundary key={String(shouldThrow)} featureName="개념 그래프">
        <ThrowingFeature shouldThrow={shouldThrow} />
      </FeatureErrorBoundary>
    </>
  );
}

describe("FeatureErrorBoundary", () => {
  it("contains a feature failure and retries the feature", () => {
    render(<RecoverableFeature />);

    expect(screen.getByRole("alert")).toHaveTextContent("개념 그래프 영역을 표시하지 못했습니다.");
    fireEvent.click(screen.getByRole("button", { name: "원인 복구" }));
    expect(screen.getByText("정상 영역")).toBeInTheDocument();
  });
});
