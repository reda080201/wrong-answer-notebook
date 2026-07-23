import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import QuickViewSettingsMenu from "./QuickViewSettingsMenu";

describe("QuickViewSettingsMenu", () => {
  it("closes before opening help and all settings", () => {
    const onOpenHelp = vi.fn();
    const onOpenAllSettings = vi.fn();
    render(
      <QuickViewSettingsMenu
        fontSize="normal"
        onFontSizeChange={vi.fn()}
        onOpenHelp={onOpenHelp}
        onOpenAllSettings={onOpenAllSettings}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "보기 설정" }));
    fireEvent.click(screen.getByRole("button", { name: "더 많은 보기 설정" }));
    fireEvent.click(screen.getByRole("button", { name: "전체 설정 열기" }));

    expect(onOpenAllSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "보기 설정" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "보기 설정" }));
    fireEvent.click(screen.getByRole("button", { name: "더 많은 보기 설정" }));
    fireEvent.click(screen.getByRole("button", { name: "도움말" }));
    expect(onOpenHelp).toHaveBeenCalledTimes(1);
  });

  it("hides answer toggle when callback is omitted", () => {
    render(
      <QuickViewSettingsMenu
        fontSize="normal"
        onFontSizeChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "보기 설정" }));
    expect(screen.queryByText("정답 가리기")).not.toBeInTheDocument();
  });
});
