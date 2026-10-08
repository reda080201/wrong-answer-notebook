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
  const shareContext = {
    contextId: "entry-a:1", questionNumber: "1", body: "문제 본문", choices: ["① 1"],
    sharePayload: { title: "자료", subject: "수학", scope: "current" as const, questionNumbers: ["1"], submitted: false, answerProtection: "released" as const,
      questions: [{ questionNumber: "1", questionText: "문제 본문", choices: ["① 1"], images: [], answer: "공식정답_②", explanation: "공식해설_지수법칙", userResponse: "내답_①", scratchNote: "메모_치환" }] },
  };
  it("shares official content only after confirmation, with independent copy and MCP actions", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const sync = vi.fn().mockResolvedValue(undefined);
    render(<ChatGptHelpLauncher mode="detail" preferences={preferences} onPreferencesChange={vi.fn()} onSyncContext={sync} questionContext={shareContext} />);
    fireEvent.click(screen.getByRole("button", { name: "ChatGPT에서 도움받기" }));
    const prompt = screen.getByRole("textbox", { name: "편집할 ChatGPT 프롬프트" }) as HTMLTextAreaElement;
    expect(prompt.value).not.toContain("공식정답_");
    fireEvent.click(screen.getByLabelText("정답·해설 공유"));
    expect(prompt.value).not.toContain("공식정답_");
    fireEvent.click(screen.getByRole("button", { name: "공유 허용" }));
    fireEvent.click(screen.getByRole("button", { name: "질문 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toContain("공식정답_②");
    expect(writeText.mock.calls[0][0]).toContain("공식해설_지수법칙");
    expect(writeText.mock.calls[0][0]).not.toContain("내답_①");
    expect(sync).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "MCP 동기화" }));
    await waitFor(() => expect(sync).toHaveBeenCalledWith(expect.objectContaining({ shareExistingAnswersAndExplanations: true })));
    fireEvent.change(prompt, { target: { value: prompt.value + " 편집한 내용" } });
    fireEvent.click(screen.getByLabelText("정답·해설 공유"));
    expect(prompt.value).not.toContain("공식정답_");
    expect(prompt.value).not.toContain("공식해설_");
    expect(prompt.value).not.toContain("편집한 내용");
    fireEvent.click(screen.getByLabelText("정답·해설 공유"));
    fireEvent.click(screen.getByRole("button", { name: "공유 허용" }));
    expect(prompt.value).not.toContain("편집한 내용");
    open.mockRestore();
  });
  it("resets disclosure and edits for a different source with the same question number", () => {
    const props = { mode: "detail" as const, preferences, onPreferencesChange: vi.fn(), onSyncContext: vi.fn() };
    const { rerender } = render(<ChatGptHelpLauncher {...props} questionContext={shareContext} />);
    fireEvent.click(screen.getByRole("button", { name: "ChatGPT에서 도움받기" }));
    fireEvent.click(screen.getByLabelText("정답·해설 공유")); fireEvent.click(screen.getByRole("button", { name: "공유 허용" }));
    fireEvent.change(screen.getByRole("textbox", { name: "편집할 ChatGPT 프롬프트" }), { target: { value: "이전 자료의 정답" } });
    rerender(<ChatGptHelpLauncher {...props} questionContext={{ ...shareContext, contextId: "entry-b:1" }} />);
    expect(screen.getByLabelText("정답·해설 공유")).not.toBeChecked();
    expect((screen.getByRole("textbox", { name: "편집할 ChatGPT 프롬프트" }) as HTMLTextAreaElement).value).not.toContain("이전 자료의 정답");
    expect((screen.getByRole("textbox", { name: "편집할 ChatGPT 프롬프트" }) as HTMLTextAreaElement).value).not.toContain("공식정답_");
  });
  it("discards edited sensitive content when response sharing is disabled", () => {
    const props = { mode: "detail" as const, onPreferencesChange: vi.fn(), onSyncContext: vi.fn(), questionContext: shareContext };
    const { rerender } = render(<ChatGptHelpLauncher {...props} preferences={{ ...preferences, shareUserResponse: true }} />);
    fireEvent.click(screen.getByRole("button", { name: "ChatGPT에서 도움받기" }));
    const prompt = screen.getByRole("textbox", { name: "편집할 ChatGPT 프롬프트" }) as HTMLTextAreaElement;
    fireEvent.change(prompt, { target: { value: "내답_① 편집" } });
    rerender(<ChatGptHelpLauncher {...props} preferences={preferences} />);
    expect(prompt.value).not.toContain("내답_①");
  });
  it("keeps official content blocked during a pre-submit session", () => {
    render(<ChatGptHelpLauncher mode="pre-submit" preferences={preferences} onPreferencesChange={vi.fn()} onSyncContext={vi.fn()} questionContext={shareContext} />);
    fireEvent.click(screen.getByRole("button", { name: "ChatGPT에서 도움받기" }));
    expect(screen.getByLabelText("정답·해설 공유")).toBeDisabled();
    expect((screen.getByRole("textbox", { name: "편집할 ChatGPT 프롬프트" }) as HTMLTextAreaElement).value).not.toContain("공식정답_");
  });
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
