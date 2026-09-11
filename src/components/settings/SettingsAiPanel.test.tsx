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
    const model = screen.getByPlaceholderText("예: openai/gpt-5.1-mini");
    fireEvent.change(model, { target: { value: "openrouter/new-model" } });
    expect(onConfigChange).not.toHaveBeenCalled();
    fireEvent.blur(model);
    expect(onConfigChange).toHaveBeenCalledWith({ model: "openrouter/new-model" });
  });

  it("commits the base URL once with Enter", () => {
    const { onConfigChange } = renderPanel();
    const baseUrl = screen.getByPlaceholderText("https://api.example.com");
    fireEvent.change(baseUrl, { target: { value: "https://example.test/v1" } });
    fireEvent.keyDown(baseUrl, { key: "Enter" });
    expect(onConfigChange).toHaveBeenCalledTimes(1);
    expect(onConfigChange).toHaveBeenCalledWith({ baseUrl: "https://example.test/v1" });
  });
});
