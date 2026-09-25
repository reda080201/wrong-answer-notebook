import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WrongAnswerEntry } from "../../../types";
import { openChatGpt } from "../../chatgpt/services/chatGptConnection";
import ChatGptSharePanel from "./ChatGptSharePanel";

vi.mock("../../chatgpt/services/chatGptConnection", () => ({
  openChatGpt: vi.fn().mockResolvedValue(undefined),
  recommendedChatGptQuestions: () => ["힌트만 줘"],
}));

vi.mock("../../../api", () => ({
  clearMcpSharedContexts: vi.fn(),
  getMcpSharedContextStatus: vi.fn().mockResolvedValue({ exportShared: false, questionCount: 0 }),
}));

const entry = {
  id: "share-entry", entryKind: "problem_sheet", subject: "수학", title: "시험", question: "legacy",
  questionImages: [], difficult: false, difficulty: "none", myAnswer: "", correctAnswer: "", explanationParts: [],
  memo: "", annotations: [], tags: [], createdAt: "2026-01-01", updatedAt: "2026-01-01", mastered: false,
  questions: [{ questionNumber: "1", questionText: "QUESTION SECRET", choices: ["CHOICE SECRET"], contentSegments: [{ id: "segment-secret", type: "text", text: "SEGMENT SECRET" }], conditions: [], equations: [], figureIds: [] }],
  answerKey: [{ questionNumber: "1", answer: "ANSWER SECRET", explanation: "EXPLANATION SECRET" }],
} as unknown as WrongAnswerEntry;
const preferences = { displayName: "오답노트", shareUserResponse: true, shareScratchNote: true, shareQuestionImages: false, shareSourcePageImages: false, copyPromptBeforeOpen: false, openChatGptAfterCopy: false };

function renderPanel() {
  const clipboard = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: clipboard } });
  const onSyncExportContext = vi.fn().mockResolvedValue(undefined);
  const view = render(<ChatGptSharePanel entry={entry} currentQuestionNumber="1" preferences={preferences} onPreferencesChange={vi.fn()} onSyncExportContext={onSyncExportContext} onBack={vi.fn()} />);
  return { ...view, clipboard, onSyncExportContext };
}

describe("ChatGptSharePanel copied prompt", () => {
  beforeEach(() => vi.clearAllMocks());

  it("copies only selected projected fields without syncing MCP or opening ChatGPT", async () => {
    const { clipboard, onSyncExportContext } = renderPanel();
    fireEvent.click(screen.getByLabelText("문제 본문"));
    fireEvent.click(screen.getByLabelText("선택지"));
    fireEvent.click(screen.getByLabelText("내 답"));
    fireEvent.click(screen.getByLabelText("풀이 메모"));
    fireEvent.click(screen.getByRole("button", { name: "질문 복사" }));
    await waitFor(() => expect(clipboard).toHaveBeenCalledTimes(1));
    const copied = clipboard.mock.calls[0][0] as string;
    for (const secret of ["QUESTION SECRET", "SEGMENT SECRET", "CHOICE SECRET", "RESPONSE SECRET", "NOTE SECRET", "ANSWER SECRET", "EXPLANATION SECRET"]) expect(copied).not.toContain(secret);
    expect(onSyncExportContext).not.toHaveBeenCalled();
    expect(openChatGpt).not.toHaveBeenCalled();
  });

  it("requires answer disclosure confirmation before copying an enabled answer payload", () => {
    renderPanel();
    fireEvent.click(screen.getByLabelText("기존 정답·해설 공유"));
    expect(screen.getByRole("button", { name: "질문 복사" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "MCP 동기화" })).toBeDisabled();
  });
});
