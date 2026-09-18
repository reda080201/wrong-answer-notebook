import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ChatGptMcpPreferences } from "../../../types";
import ChatGptHelpLauncher from "./ChatGptHelpLauncher";

const preferences: ChatGptMcpPreferences = {
  displayName: "오답노트",
  shareUserResponse: false,
  shareScratchNote: false,
  shareQuestionImages: false,
  shareSourcePageImages: false,
  copyPromptBeforeOpen: true,
  openChatGptAfterCopy: false,
};

describe("ChatGptHelpLauncher", () => {
  it("copies the current question without attempting MCP sync and obeys response sharing preferences", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const onSyncContext = vi.fn().mockResolvedValue(undefined);
    const onPreferencesChange = vi.fn();
    const { rerender } = render(
      <ChatGptHelpLauncher
        mode="pre-submit"
        preferences={preferences}
        onPreferencesChange={onPreferencesChange}
        onSyncContext={onSyncContext}
        questionContext={{
          questionNumber: "12",
          body: "함수 f(x)를 구하시오.",
          choices: ["① 1", "② 2"],
          response: "②",
          scratchNote: "치환을 시도함",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "ChatGPT에서 도움받기" }));
    const dialog = screen.getByRole("dialog", { name: "ChatGPT에서 도움받기" });
    const prompt = within(dialog).getByRole("textbox", { name: "편집할 ChatGPT 프롬프트" });
    expect((prompt as HTMLTextAreaElement).value).toContain("12번");
    expect((prompt as HTMLTextAreaElement).value).toContain("② 2");
    expect((prompt as HTMLTextAreaElement).value).not.toContain("치환을 시도함");

    fireEvent.click(within(dialog).getByRole("button", { name: "질문 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith((prompt as HTMLTextAreaElement).value));
    expect(onSyncContext).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByLabelText("풀이 메모"));
    expect(onPreferencesChange).toHaveBeenCalledWith({ shareScratchNote: true });
    rerender(
      <ChatGptHelpLauncher
        mode="pre-submit"
        preferences={{ ...preferences, shareScratchNote: true }}
        onPreferencesChange={onPreferencesChange}
        onSyncContext={onSyncContext}
        questionContext={{ questionNumber: "12", body: "함수 f(x)를 구하시오.", choices: ["① 1", "② 2"], response: "②", scratchNote: "치환을 시도함" }}
      />,
    );
    expect((screen.getByRole("textbox", { name: "편집할 ChatGPT 프롬프트" }) as HTMLTextAreaElement).value).toContain("치환을 시도함");
  });

  it("does not overwrite a user-edited prompt when the same question context changes", () => {
    const { rerender } = render(
      <ChatGptHelpLauncher
        mode="pre-submit"
        preferences={preferences}
        onPreferencesChange={vi.fn()}
        onSyncContext={vi.fn().mockResolvedValue(undefined)}
        questionContext={{ questionNumber: "3", body: "원래 본문", choices: [] }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "ChatGPT에서 도움받기" }));
    const prompt = screen.getByRole("textbox", { name: "편집할 ChatGPT 프롬프트" });
    fireEvent.change(prompt, { target: { value: "내가 쓴 질문" } });

    rerender(
      <ChatGptHelpLauncher
        mode="pre-submit"
        preferences={preferences}
        onPreferencesChange={vi.fn()}
        onSyncContext={vi.fn().mockResolvedValue(undefined)}
        questionContext={{ questionNumber: "3", body: "갱신된 본문", choices: [] }}
      />,
    );
    expect(screen.getByRole("textbox", { name: "편집할 ChatGPT 프롬프트" })).toHaveValue("내가 쓴 질문");

    rerender(
      <ChatGptHelpLauncher
        mode="pre-submit"
        preferences={preferences}
        onPreferencesChange={vi.fn()}
        onSyncContext={vi.fn().mockResolvedValue(undefined)}
        questionContext={{ questionNumber: "4", body: "다음 본문", choices: [] }}
      />,
    );
    expect((screen.getByRole("textbox", { name: "편집할 ChatGPT 프롬프트" }) as HTMLTextAreaElement).value).toContain("4번");
  });
});
