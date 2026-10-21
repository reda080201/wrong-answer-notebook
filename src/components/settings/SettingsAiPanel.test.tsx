import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AiProviderType } from "../../types";
import SettingsAiPanel from "./SettingsAiPanel";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(() => true) }));

const provider = {
  provider: "openrouter" as AiProviderType,
  type: "openrouter" as AiProviderType,
  model: "old/model",
  baseUrl: "https://openrouter.ai/api/v1",
  enabled: true,
  keySource: "keyring" as const,
};

function renderPanel(onConfigChange = vi.fn().mockResolvedValue(true)) {
  return {
    onConfigChange,
    ...render(
      <SettingsAiPanel
        provider={provider}
        status={null}
        statusLoading={false}
        statusError={null}
        keyInput=""
        onKeyInputChange={vi.fn()}
        onConfigChange={onConfigChange}
        onStoreKey={vi.fn()}
        onRemoveKey={vi.fn()}
        onTestConnection={vi.fn()}
      />,
    ),
  };
}

describe("SettingsAiPanel", () => {
  it("keeps model edits local until blur", () => {
    const { onConfigChange } = renderPanel();
    const model = screen.getByRole("textbox", { name: "모델" });
    fireEvent.change(model, { target: { value: "openrouter/new-model" } });
    expect(onConfigChange).not.toHaveBeenCalled();
    fireEvent.blur(model);
    expect(onConfigChange).toHaveBeenCalledWith({ model: "openrouter/new-model" });
  });

  it("commits the base URL once when Enter blurs the field", () => {
    const { onConfigChange } = renderPanel();
    const baseUrl = screen.getByRole("textbox", { name: /^기본 URL/ });
    baseUrl.focus();
    fireEvent.change(baseUrl, { target: { value: "https://example.test/v1" } });
    fireEvent.keyDown(baseUrl, { key: "Enter" });
    expect(onConfigChange).toHaveBeenCalledTimes(1);
    expect(onConfigChange).toHaveBeenCalledWith({ baseUrl: "https://example.test/v1" });
  });

  it("does not commit a second time when Enter is followed by blur", () => {
    const { onConfigChange } = renderPanel();
    const model = screen.getByRole("textbox", { name: "모델" });
    model.focus();
    fireEvent.change(model, { target: { value: "openrouter/new-model" } });
    fireEvent.keyDown(model, { key: "Enter" });
    fireEvent.blur(model);
    expect(onConfigChange).toHaveBeenCalledTimes(1);
  });

  it("disables provider and key controls while a provider operation is pending", () => {
    render(
      <SettingsAiPanel
        provider={provider}
        status={null}
        statusLoading={false}
        operationPending
        statusError={null}
        keyInput="key"
        onKeyInputChange={vi.fn()}
        onConfigChange={vi.fn()}
        onStoreKey={vi.fn()}
        onRemoveKey={vi.fn()}
        onTestConnection={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("AI 제공자")).toBeDisabled();
    expect(screen.getByRole("button", { name: "키 저장" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "연결 테스트" })).toBeDisabled();
  });
});
