import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WrongAnswerEntry } from "../types";
import ImportFromGptModal from "./ImportFromGptModal";

vi.mock("../api", () => ({
  getImageUrl: vi.fn(),
  pickImages: vi.fn(),
  saveImageFiles: vi.fn().mockResolvedValue(["img_mock.png"]),
}));

function confirmDangerousImportIfShown() {
  const checkbox = screen.queryByLabelText(/손글씨\/도표 연결 위험 항목을 확인했습니다/);
  if (checkbox) fireEvent.click(checkbox);
}

describe("ImportFromGptModal", () => {
  const sourceEntry: WrongAnswerEntry = {
    id: "entry-1",
    subject: "수학",
    title: "방정식",
    question: "x + 1 = 2",
    questionImages: ["q1.png"],
    entryKind: "wrong_answer",
    difficult: false,
    difficulty: "none",
    myAnswer: "",
    correctAnswer: "",
    explanationParts: [],
    memo: "",
    annotations: [],
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    mastered: false,
  };

  it("sends stored question images to the Gemini provider", async () => {
    const onGenerateWithAi = vi.fn().mockResolvedValue(JSON.stringify({
      title: "Vision 결과",
      question: "1. 문제",
      rejectedNotes: [],
      audit: {
        expectedQuestionNumbers: ["1"],
        detectedQuestionNumbers: ["1"],
        missingQuestionNumbers: [],
        uncertainQuestionNumbers: [],
        handwritingExcluded: true,
        needsReviewCount: 0,
      },
    }));
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={vi.fn()}
        sourceEntry={sourceEntry}
        mode="solution"
        aiProvider={{ type: "gemini-flash-lite", enabled: true, keySource: "env", hasStoredKey: false }}
        aiProviderStatus={{ type: "gemini-flash-lite", enabled: true, keySource: "env", hasStoredKey: false, hasEnvKey: true, available: true }}
        onGenerateWithAi={onGenerateWithAi}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "이미지 AI 분석" }));
    await waitFor(() => expect(onGenerateWithAi).toHaveBeenCalled());
    expect(onGenerateWithAi.mock.calls[0][2]).toEqual(["q1.png"]);
    expect(await screen.findByText("AI 판독 감사", {}, { timeout: 10000 })).toBeInTheDocument();
  }, 30000);

  it("adds user expected question numbers to Gemini prompts", async () => {
    const onGenerateWithAi = vi.fn().mockResolvedValue(JSON.stringify({
      title: "Vision 결과",
      question: "1. 문제",
      rejectedNotes: [],
      audit: {
        expectedQuestionNumbers: ["1"],
        detectedQuestionNumbers: ["1"],
        missingQuestionNumbers: [],
        uncertainQuestionNumbers: [],
        handwritingExcluded: true,
        needsReviewCount: 0,
      },
    }));
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={vi.fn()}
        sourceEntry={sourceEntry}
        mode="solution"
        aiProvider={{ type: "gemini-flash-lite", enabled: true, keySource: "env", hasStoredKey: false }}
        aiProviderStatus={{ type: "gemini-flash-lite", enabled: true, keySource: "env", hasStoredKey: false, hasEnvKey: true, available: true }}
        onGenerateWithAi={onGenerateWithAi}
      />,
    );

    fireEvent.change(screen.getByLabelText("예상 문제 번호"), { target: { value: "1-3" } });
    fireEvent.click(screen.getByRole("button", { name: "이미지 AI 분석" }));

    await waitFor(() => expect(onGenerateWithAi).toHaveBeenCalled());
    expect(onGenerateWithAi.mock.calls[0][0]).toContain("예상 문제 번호는 1, 2, 3 입니다");
  }, 30000);

  it("keeps Gemini Vision disabled until an image is available while allowing text AI", async () => {
    const onGenerateWithAi = vi.fn().mockResolvedValue(JSON.stringify({
      title: "텍스트 결과",
      question: "1. 문제",
      rejectedNotes: [],
      audit: {
        expectedQuestionNumbers: ["1"],
        detectedQuestionNumbers: ["1"],
        missingQuestionNumbers: [],
        uncertainQuestionNumbers: [],
        handwritingExcluded: true,
        needsReviewCount: 0,
      },
    }));
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={vi.fn()}
        sourceEntry={{ ...sourceEntry, questionImages: [] }}
        mode="solution"
        aiProvider={{ type: "gemini-flash-lite", enabled: true, keySource: "env", hasStoredKey: false }}
        aiProviderStatus={{ type: "gemini-flash-lite", enabled: true, keySource: "env", hasStoredKey: false, hasEnvKey: true, available: true }}
        onGenerateWithAi={onGenerateWithAi}
      />,
    );

    expect(screen.getByRole("button", { name: "이미지 AI 분석" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "텍스트 AI 정리" })).not.toBeDisabled();
    expect(screen.getByText(/Gemini Vision을 쓰려면/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "텍스트 AI 정리" }));
    await waitFor(() => expect(onGenerateWithAi).toHaveBeenCalled());
    expect(onGenerateWithAi.mock.calls[0][2]).toEqual([]);
  });

  it("keeps AI provider controls retryable after a failed call", async () => {
    const onGenerateWithAi = vi.fn().mockRejectedValue(new Error("network down"));
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={vi.fn()}
        sourceEntry={{ ...sourceEntry, questionImages: [] }}
        mode="solution"
        aiProvider={{ type: "gemini-flash-lite", enabled: true, keySource: "env", hasStoredKey: false }}
        aiProviderStatus={{ type: "gemini-flash-lite", enabled: true, keySource: "env", hasStoredKey: false, hasEnvKey: true, available: true }}
        onGenerateWithAi={onGenerateWithAi}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "텍스트 AI 정리" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("설정은 유지됩니다");
    expect(screen.getByRole("button", { name: "텍스트 AI 정리" })).not.toBeDisabled();
    expect(onGenerateWithAi).toHaveBeenCalledTimes(1);
  });

  it("blocks applying imports with missing question validation errors", () => {
    const onApply = vi.fn();
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={onApply}
      />,
    );

    fireEvent.change(screen.getByLabelText("GPT 답변 붙여넣기"), {
      target: {
        value: JSON.stringify({
          question: "1. 문제",
          audit: {
            expectedQuestionNumbers: ["1", "2"],
            detectedQuestionNumbers: ["1"],
            missingQuestionNumbers: ["2"],
            uncertainQuestionNumbers: [],
            handwritingExcluded: true,
            needsReviewCount: 0,
          },
        }),
      },
    });

    expect(screen.getByText(/2번 문제가 이미지에서 예상됐지만/)).toBeInTheDocument();
    expect(screen.getByText("적용 불가")).toBeInTheDocument();
    expect(screen.queryByLabelText(/손글씨\/도표 연결 위험 항목을 확인했습니다/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "폼으로 보내기" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "폼으로 보내기" }));

    expect(onApply).not.toHaveBeenCalled();
  });

  it("uses user expected question numbers over AI audit when validating missing questions", () => {
    const onApply = vi.fn();
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={onApply}
      />,
    );

    fireEvent.change(screen.getByLabelText("예상 문제 번호"), { target: { value: "1-3" } });
    fireEvent.change(screen.getByLabelText("GPT 답변 붙여넣기"), {
      target: {
        value: JSON.stringify({
          question: "1. 문제\n\n3. 문제",
          audit: {
            expectedQuestionNumbers: ["1", "3"],
            detectedQuestionNumbers: ["1", "3"],
            missingQuestionNumbers: [],
            uncertainQuestionNumbers: [],
            handwritingExcluded: true,
            needsReviewCount: 0,
          },
        }),
      },
    });

    expect(screen.getByText(/사용자 기준 3개 문항/)).toBeInTheDocument();
    expect(screen.getByText("사용자 기준")).toBeInTheDocument();
    expect(screen.getByText("사용자 입력 기준 누락이 감지되었습니다.")).toBeInTheDocument();
    expect(screen.getByText(/2번 문제가 이미지에서 예상됐지만/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "폼으로 보내기" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "폼으로 보내기" }));
    expect(onApply).not.toHaveBeenCalled();
  });

  it("falls back to AI audit when user expected question input is cleared", () => {
    const onApply = vi.fn();
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={onApply}
      />,
    );

    fireEvent.change(screen.getByLabelText("예상 문제 번호"), { target: { value: "1-3" } });
    fireEvent.change(screen.getByLabelText("예상 문제 번호"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("GPT 답변 붙여넣기"), {
      target: {
        value: JSON.stringify({
          question: "1. 문제\n\n3. 문제",
          audit: {
            expectedQuestionNumbers: ["1", "3"],
            detectedQuestionNumbers: ["1", "3"],
            missingQuestionNumbers: [],
            uncertainQuestionNumbers: [],
            handwritingExcluded: true,
            needsReviewCount: 0,
          },
        }),
      },
    });

    expect(screen.queryByText("사용자 기준")).not.toBeInTheDocument();
    expect(screen.queryByText(/2번 문제가 이미지에서 예상됐지만/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "폼으로 보내기" }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        question: expect.stringContaining("3. 문제"),
      }),
      undefined,
    );
  });

  it("allows confirmable handwriting and figure risks after confirmation", () => {
    const onApply = vi.fn();
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={onApply}
      />,
    );

    fireEvent.change(screen.getByLabelText("GPT 답변 붙여넣기"), {
      target: {
        value: JSON.stringify({
          question: "1. 문제",
          rejectedNotes: ["학생 필기 조건 표시"],
          audit: {
            expectedQuestionNumbers: ["1"],
            detectedQuestionNumbers: ["1"],
            missingQuestionNumbers: [],
            uncertainQuestionNumbers: [],
            handwritingExcluded: false,
            needsReviewCount: 0,
          },
          figures: [{ questionNumber: "1", title: "그래프", caption: "확인 필요" }],
        }),
      },
    });

    expect(screen.getByText("확인 후 적용 가능")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "폼으로 보내기" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/손글씨\/도표 연결 위험 항목을 확인했습니다/));
    fireEvent.click(screen.getByRole("button", { name: "폼으로 보내기" }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        question: "1. 문제",
      }),
      undefined,
    );
  });

  it("shows preview after paste and applies parsed data", () => {
    const onApply = vi.fn();
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={onApply}
      />,
    );

    fireEvent.change(screen.getByLabelText("GPT 답변 붙여넣기"), {
      target: { value: "1. 첫 문제  ① 정답" },
    });

    expect(screen.getByText("텍스트")).toBeInTheDocument();
    expect(screen.getByText("1개")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("JSON이 아닌 텍스트로 감지되었습니다");

    fireEvent.click(screen.getByRole("button", { name: "폼으로 보내기" }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        entryKind: "problem_sheet",
        question: "1. 첫 문제\n① 정답",
        questionImages: [],
      }),
      undefined,
    );
  });

  it("reads a JSON file and shows a preview", async () => {
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={vi.fn()}
      />,
    );

    const file = new File(
      [JSON.stringify({ title: "파일 시험지", subject: "국어", question: "1. 지문" })],
      "exam.json",
      { type: "application/json" },
    );

    fireEvent.change(screen.getByLabelText("텍스트 파일 업로드"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByText("파일 시험지")).toBeInTheDocument();
    });
    expect(screen.getByText("JSON")).toBeInTheDocument();
    expect(screen.queryByText(/JSON이 아닌 텍스트로 감지되었습니다/)).not.toBeInTheDocument();
  });

  it("shows repeated difficulty validation warnings", () => {
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("GPT 답변 붙여넣기"), {
      target: {
        value: JSON.stringify({
          question: "1. 문제\n\n2. 문제\n\n3. 문제",
          answerKey: [
            { questionNumber: "1", answer: "①", explanation: "풀이", difficulty: "medium" },
            { questionNumber: "2", answer: "②", explanation: "풀이", difficulty: "medium" },
            { questionNumber: "3", answer: "③", explanation: "풀이", difficulty: "medium" },
          ],
        }),
      },
    });

    expect(screen.getByText(/난이도가 모두 동일합니다/)).toBeInTheDocument();
  });

  it("shows answer key preview and applies memo with answers", () => {
    const onApply = vi.fn();
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={onApply}
      />,
    );

    fireEvent.change(screen.getByLabelText("GPT 답변 붙여넣기"), {
      target: {
        value: JSON.stringify({
          question: "1. 문제",
          memo: "전체 메모",
          importantNotes: ["핵심 조건"],
          answerKey: [
            {
              questionNumber: "1",
              answer: "③",
              explanation: "조건을 확인한다.",
              importantPoints: ["보기 비교"],
            },
          ],
        }),
      },
    });

    expect(screen.getByText("있음")).toBeInTheDocument();
    expect(screen.getByText("답안지 미리보기")).toBeInTheDocument();
    expect(screen.getByText("③")).toBeInTheDocument();

    confirmDangerousImportIfShown();
    fireEvent.click(screen.getByRole("button", { name: "폼으로 보내기" }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        memo: expect.stringContaining("핵심 조건"),
        answerKey: [
          expect.objectContaining({
            questionNumber: "1",
            answer: "③",
          }),
        ],
      }),
      undefined,
    );
  });

  it("copies the selected GPT prompt template", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={vi.fn()}
        promptTemplates={[
          {
            id: "prompt-1",
            name: "시험지 JSON",
            content: "JSON으로 정리해줘",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "프롬프트 복사" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("JSON으로 정리해줘");
    });
    expect(await screen.findByText("프롬프트를 복사했습니다.")).toBeInTheDocument();
  });

  it("imports solution JSON from clipboard and applies with fill mode", async () => {
    const onApply = vi.fn();
    const readText = vi.fn().mockResolvedValue(JSON.stringify({
      question: "x + 1 = 2",
      correctAnswer: "x = 1",
      explanationParts: [{ id: "solution", text: "양변에서 1을 뺀다.", images: [] }],
      memo: "이항 확인",
      rejectedNotes: [],
      audit: {
        expectedQuestionNumbers: [],
        detectedQuestionNumbers: [],
        missingQuestionNumbers: [],
        uncertainQuestionNumbers: [],
        handwritingExcluded: true,
        needsReviewCount: 0,
      },
    }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { readText, writeText },
      configurable: true,
    });

    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={onApply}
        mode="solution"
        sourceEntry={sourceEntry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "클립보드에서 가져오기" }));

    expect(await screen.findByText("JSON")).toBeInTheDocument();
    expect(screen.getByText("q1.png")).toBeInTheDocument();
    confirmDangerousImportIfShown();
    fireEvent.click(screen.getByRole("button", { name: "해설 적용하기" }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        question: "x + 1 = 2",
        correctAnswer: "x = 1",
        explanationParts: [expect.objectContaining({ text: "양변에서 1을 뺀다." })],
      }),
      "fill",
    );
  });

  it("applies edited preview fields and edited answer key values", () => {
    const onApply = vi.fn();
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={onApply}
      />,
    );

    fireEvent.change(screen.getByLabelText("GPT 답변 붙여넣기"), {
      target: {
        value: JSON.stringify({
          title: "원본 제목",
          question: "1. 원본 문제",
          memo: "원본 메모",
          answerKey: [
            {
              questionNumber: "1",
              answer: "①",
              explanation: "원본 풀이",
              importantPoints: [],
            },
          ],
        }),
      },
    });

    fireEvent.change(screen.getByLabelText("제목"), {
      target: { value: "수정 제목" },
    });
    fireEvent.change(screen.getByLabelText("본문"), {
      target: { value: "1. 수정 문제  ① 보기" },
    });
    fireEvent.change(screen.getByLabelText("메모"), {
      target: { value: "수정 메모" },
    });
    fireEvent.change(screen.getByLabelText("1 정답"), {
      target: { value: "④" },
    });
    fireEvent.change(screen.getByLabelText("1 풀이"), {
      target: { value: "수정 풀이" },
    });

    confirmDangerousImportIfShown();
    fireEvent.click(screen.getByRole("button", { name: "폼으로 보내기" }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "수정 제목",
        question: "1. 수정 문제\n① 보기",
        memo: "수정 메모",
        answerKey: [
          expect.objectContaining({
            answer: "④",
            explanation: "수정 풀이",
          }),
        ],
      }),
      undefined,
    );
  });

  it("clears imported tags before applying", () => {
    const onApply = vi.fn();
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={onApply}
      />,
    );

    fireEvent.change(screen.getByLabelText("GPT 답변 붙여넣기"), {
      target: {
        value: JSON.stringify({
          title: "태그 포함",
          question: "1. 문제",
          tags: ["GPT", "시험지"],
        }),
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "태그 전체 삭제" }));
    confirmDangerousImportIfShown();
    fireEvent.click(screen.getByRole("button", { name: "폼으로 보내기" }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: [],
      }),
      undefined,
    );
  });

  it("rejects oversized all-in-one ZIP files", async () => {
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={vi.fn()}
      />,
    );
    const largeZip = new File([""], "large.zip", { type: "application/zip" });
    Object.defineProperty(largeZip, "size", { value: 50 * 1024 * 1024 + 1 });

    fireEvent.change(screen.getByLabelText("올인원 가져오기"), {
      target: { files: [largeZip] },
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("ZIP 파일이 너무 큽니다");
    });
  });

  it("keeps apply disabled for empty input", () => {
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "폼으로 보내기" })).toBeDisabled();
  });
});
