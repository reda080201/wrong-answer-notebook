import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { deleteImage, pickImages, saveImageFiles } from "../../../api";
import type { WrongAnswerEntry } from "../../../types";
import v2WrapperFixture from "../../../test/fixtures/nswer_nje_s2_v2_wrapper_single.json";
import { IMPORT_LIMITS } from "../services/importLimits";
import ImportFromGptModal, { entryKindAutoLabel } from "./ImportFromGptModal";

vi.mock("../../../api", () => ({
  getImageUrl: vi.fn().mockResolvedValue("blob:fixture"),
  pickImages: vi.fn(),
  saveImageFiles: vi.fn().mockResolvedValue(["img_mock.png"]),
  deleteImage: vi.fn().mockResolvedValue(undefined),
}));

function confirmDangerousImportIfShown() {
  const checkbox = screen.queryByLabelText(/손글씨\/도표 연결 위험 항목을 확인했습니다/);
  if (checkbox) fireEvent.click(checkbox);
}

function quickSaveFixtureFile(): File {
  return new File([JSON.stringify({
    schemaVersion: "wrong-answer-notebook-import-v2",
    importType: "problem_sheet",
    entries: [{
      entryKind: "problem_sheet",
      subject: "수학",
      title: "빠른 저장 시험지",
      questions: [{ questionNumber: "1", questionText: "문제", choices: ["① 1"], conditions: [], equations: [], contentSegments: [], figureIds: [], points: 2 }],
      answerKey: [{ questionNumber: "1", answer: "①", explanation: "해설" }],
      audit: { expectedQuestionNumbers: ["1"], detectedQuestionNumbers: ["1"], missingQuestionNumbers: [], uncertainQuestionNumbers: [], handwritingExcluded: true, needsReviewCount: 0 },
    }],
  })], "import.json", { type: "application/json" });
}

function structuredFixtureFile(questions: unknown[]): File {
  return new File([JSON.stringify({
    schemaVersion: "wrong-answer-notebook-import-v2",
    importType: "problem_sheet",
    entries: [{
      entryKind: "problem_sheet",
      subject: "수학",
      title: "구조화 검증",
      questions,
      audit: { expectedQuestionNumbers: ["1"], detectedQuestionNumbers: ["1"], missingQuestionNumbers: [], uncertainQuestionNumbers: [], handwritingExcluded: true, needsReviewCount: 0 },
    }],
  })], "import.json", { type: "application/json" });
}

describe("ImportFromGptModal", () => {
  it("uses the matching label for every automatically inferred entry kind", () => {
    expect(entryKindAutoLabel("problem_sheet")).toBe("문제지로 자동 판정됨");
    expect(entryKindAutoLabel("wrong_answer")).toBe("개별 오답으로 자동 판정됨");
    expect(entryKindAutoLabel("concept")).toBe("개념노트로 자동 판정됨");
    expect(entryKindAutoLabel("lecture")).toBe("특강자료로 자동 판정됨");
  });

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

  it("allows answer-only supplemental JSON without a question body", async () => {
    const onApply = vi.fn();
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={onApply}
        sourceEntry={sourceEntry}
        mode="supplemental"
        supplementalMode="answer_key"
      />,
    );
    fireEvent.change(screen.getByLabelText("GPT 답변 붙여넣기"), {
      target: { value: JSON.stringify({ answerKey: [{ questionNumber: "1", answer: "③" }] }) },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "수정 후 저장" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "수정 후 저장" }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ answerKey: [expect.objectContaining({ questionNumber: "1", answer: "③" })], question: "" }), undefined, [], [], undefined);
  });

  it("removes every supplemental image created by the modal when a cancelled draft removed it from the list", async () => {
    vi.mocked(pickImages).mockResolvedValueOnce(["supplemental-created.png"]);
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={vi.fn()}
        sourceEntry={sourceEntry}
        mode="supplemental"
        supplementalMode="answer_key"
      />,
    );

    fireEvent.click(document.querySelector(".image-upload-area")!);
    await screen.findByLabelText("supplemental-created.png 이미지 삭제");
    fireEvent.click(screen.getByLabelText("supplemental-created.png 이미지 삭제"));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    await waitFor(() => {
      expect(deleteImage).toHaveBeenCalledWith("supplemental-created.png");
    });
  });

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

  it("adds special expected question identifiers to Gemini prompts", async () => {
    const onGenerateWithAi = vi.fn().mockResolvedValue(JSON.stringify({
      title: "Vision 결과",
      question: "A-1. 문제",
      rejectedNotes: [],
      audit: {
        expectedQuestionNumbers: ["A-1"],
        detectedQuestionNumbers: ["A-1"],
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

    fireEvent.change(screen.getByLabelText("예상 문제 번호"), { target: { value: "A-1, A-2, Ⅰ-1" } });
    fireEvent.click(screen.getByRole("button", { name: "이미지 AI 분석" }));

    await waitFor(() => expect(onGenerateWithAi).toHaveBeenCalled());
    expect(onGenerateWithAi.mock.calls[0][0]).toContain("예상 문제 번호는 A-1, A-2, Ⅰ-1 입니다");
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
    expect(screen.getByRole("button", { name: "수정 후 저장" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "수정 후 저장" }));

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
    expect(screen.getByRole("button", { name: "수정 후 저장" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "수정 후 저장" }));
    expect(onApply).not.toHaveBeenCalled();
  });

  it("blocks applying when a special expected question identifier is missing", () => {
    const onApply = vi.fn();
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={onApply}
      />,
    );

    fireEvent.change(screen.getByLabelText("예상 문제 번호"), { target: { value: "A-1, A-2" } });
    fireEvent.change(screen.getByLabelText("GPT 답변 붙여넣기"), {
      target: {
        value: JSON.stringify({
          question: "A-1. 문제",
          audit: {
            expectedQuestionNumbers: ["A-1"],
            detectedQuestionNumbers: ["A-1"],
            missingQuestionNumbers: [],
            uncertainQuestionNumbers: [],
            handwritingExcluded: true,
            needsReviewCount: 0,
          },
        }),
      },
    });

    expect(screen.getByText(/A-2 문제가 이미지에서 예상됐지만/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "수정 후 저장" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "수정 후 저장" }));

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
    fireEvent.click(screen.getByRole("button", { name: "수정 후 저장" }));

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
    expect(screen.getByRole("button", { name: "수정 후 저장" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/손글씨\/도표 연결 위험 항목을 확인했습니다/));
    fireEvent.click(screen.getByRole("button", { name: "수정 후 저장" }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        question: "1. 문제",
      }),
      undefined,
    );
  });

  it("allows described-only figures without blocking confirmation", () => {
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
            expectedQuestionNumbers: ["1"],
            detectedQuestionNumbers: ["1"],
            missingQuestionNumbers: [],
            uncertainQuestionNumbers: [],
            handwritingExcluded: true,
            needsReviewCount: 0,
          },
          figures: [
            {
              questionNumber: "1",
              title: "설명 그래프",
              caption: "이미지 없이 설명 도표로 유지",
              image: "",
              source: "described_only",
            },
          ],
        }),
      },
    });

    expect(screen.getByText("설명 도표")).toBeInTheDocument();
    expect(screen.queryByLabelText(/손글씨\/도표 연결 위험 항목을 확인했습니다/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "수정 후 저장" }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        figures: [
          expect.objectContaining({
            source: "described_only",
            image: undefined,
          }),
        ],
      }),
      undefined,
    );
  });

  it("offers figure actions for original figures without linked images", () => {
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
            expectedQuestionNumbers: ["1"],
            detectedQuestionNumbers: ["1"],
            missingQuestionNumbers: [],
            uncertainQuestionNumbers: [],
            handwritingExcluded: true,
            needsReviewCount: 0,
          },
          figures: [
            {
              questionNumber: "1",
              title: "원본 필요 도표",
              image: "",
              source: "original",
            },
          ],
        }),
      },
    });

    expect(screen.getAllByText("이미지 나중에 연결").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "설명 도표로 유지" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "도표 항목 제외" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "수정 후 저장" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "도표 항목 제외" }));
    fireEvent.click(screen.getByRole("button", { name: "수정 후 저장" }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        figures: [],
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

    fireEvent.click(screen.getByRole("button", { name: "수정 후 저장" }));

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

  it("keeps the base problem-sheet import focused while preserving answer data", () => {
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
              strategy: "조건을 식으로 바꾼다",
              steps: ["조건 정리"],
              choiceJudgements: [{ marker: "①", text: "조건 불일치" }],
              wrongPoint: "조건 누락",
              reviewPoint: "조건 표시",
              importantPoints: ["보기 비교"],
            },
          ],
        }),
      },
    });

    expect(screen.getByText("답안지 미리보기")).toBeInTheDocument();

    confirmDangerousImportIfShown();
    fireEvent.click(screen.getByRole("button", { name: "수정 후 저장" }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        memo: expect.stringContaining("핵심 조건"),
        answerKey: [
          expect.objectContaining({
            questionNumber: "1",
            answer: "③",
            strategy: "조건을 식으로 바꾼다",
            steps: ["조건 정리"],
            choiceJudgements: [{ marker: "①", text: "조건 불일치" }],
            wrongPoint: "조건 누락",
            reviewPoint: "조건 표시",
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

  it("applies edited preview fields and edited answer key values for legacy flat import", () => {
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
    fireEvent.change(screen.getByLabelText("1 정답"), { target: { value: "④" } });
    fireEvent.change(screen.getByLabelText("1 풀이"), { target: { value: "수정 풀이" } });

    confirmDangerousImportIfShown();
    fireEvent.click(screen.getByRole("button", { name: "수정 후 저장" }));

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
    fireEvent.click(screen.getByRole("button", { name: "수정 후 저장" }));

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
    Object.defineProperty(largeZip, "size", { value: IMPORT_LIMITS.MAX_ARCHIVE_BYTES + 1 });

    fireEvent.change(screen.getByLabelText("올인원 가져오기"), {
      target: { files: [largeZip] },
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        `ZIP 파일이 ${IMPORT_LIMITS.MAX_ARCHIVE_BYTES / 1024 / 1024}MB를 초과합니다.`,
      );
    });
  });

  it("runs a single-entry ZIP through save, draft preview, and form apply", async () => {
    const onApply = vi.fn();
    const zip = new JSZip();
    zip.file("import.json", JSON.stringify({
      schemaVersion: "wrong-answer-notebook-import-v2",
      importType: "problem_sheet",
      title: "ZIP 시험지",
      subject: "수학",
      entries: [{
        entryKind: "problem_sheet",
        title: "ZIP 시험지",
        question: "1. 이미지 문제",
        questionImages: ["q1.png"],
        audit: {
          expectedQuestionNumbers: ["1"],
          detectedQuestionNumbers: ["1"],
          missingQuestionNumbers: [],
          uncertainQuestionNumbers: [],
          handwritingExcluded: true,
          needsReviewCount: 0,
        },
      }],
    }));
    zip.file("q1.png", new Uint8Array([137, 80, 78, 71]));
    const blob = await zip.generateAsync({ type: "blob" });
    const file = new File([blob], "bundle.zip", { type: "application/zip" });

    render(<ImportFromGptModal fallbackSubject="수학" onClose={vi.fn()} onApply={onApply} />);
    fireEvent.change(screen.getByLabelText("올인원 가져오기"), { target: { files: [file] } });

    expect(await screen.findByDisplayValue("ZIP 시험지")).toBeInTheDocument();
    expect(saveImageFiles).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "수정 후 저장" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ entryKind: "problem_sheet", questionImages: ["q1.png"] }),
      undefined,
      expect.arrayContaining([expect.objectContaining({ name: "q1.png" })]),
    ));
  }, 30000);

  it("keeps ordered question source crops through ZIP preview and direct save", async () => {
    const onApply = vi.fn();
    const zip = new JSZip();
    zip.file("import.json", JSON.stringify({
      schemaVersion: "wrong-answer-notebook-import-v2",
      importType: "problem_sheet",
      subject: "수학",
      entries: [{
        entryKind: "problem_sheet",
        title: "문항 원본 crop",
        questions: [
          { questionNumber: "9", questionText: "9번", conditions: [], equations: [], choices: [], contentSegments: [{ id: "q9", type: "text", text: "9번" }], figureIds: [] },
          { questionNumber: "10", questionText: "10번", conditions: [], equations: [], choices: [], contentSegments: [{ id: "q10", type: "text", text: "10번" }], figureIds: [] },
        ],
        questionSourceCrops: [
          { id: "q9-a", questionNumber: "9", page: 3, order: 0, image: "images/q9-a.png", sourcePageImage: "images/page-3.png" },
          { id: "q9-b", questionNumber: "9", page: 4, order: 1, image: "images/q9-b.png", sourcePageImage: "images/page-4.png" },
          { id: "q10-a", questionNumber: "10", page: 5, order: 0, image: "images/q10-a.png", sourcePageImage: "images/page-5.png" },
        ],
        audit: { expectedQuestionNumbers: ["9", "10"], detectedQuestionNumbers: ["9", "10"], missingQuestionNumbers: [], uncertainQuestionNumbers: [], handwritingExcluded: true, needsReviewCount: 0 },
      }],
    }));
    for (const name of ["images/q9-a.png", "images/q9-b.png", "images/q10-a.png", "images/page-3.png", "images/page-4.png", "images/page-5.png"]) {
      zip.file(name, new Uint8Array([137, 80, 78, 71]));
    }
    const file = new File([await zip.generateAsync({ type: "blob" })], "crops.zip", { type: "application/zip" });

    render(<ImportFromGptModal fallbackSubject="수학" onClose={vi.fn()} onApply={onApply} />);
    fireEvent.change(screen.getByLabelText("올인원 가져오기"), { target: { files: [file] } });
    expect(await screen.findByDisplayValue("문항 원본 crop")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "수정 후 저장" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        questionSourceCrops: [
          expect.objectContaining({ id: "q9-a", questionNumber: "9", page: 3, order: 0, image: "images/q9-a.png", sourcePageImage: "images/page-3.png" }),
          expect.objectContaining({ id: "q9-b", questionNumber: "9", page: 4, order: 1, image: "images/q9-b.png", sourcePageImage: "images/page-4.png" }),
          expect.objectContaining({ id: "q10-a", questionNumber: "10", page: 5, order: 0, image: "images/q10-a.png", sourcePageImage: "images/page-5.png" }),
        ],
      }),
      undefined,
      expect.arrayContaining([expect.objectContaining({ name: "q9-a.png" }), expect.objectContaining({ name: "q9-b.png" })]),
    ));
  }, 30000);

  it("opens a single v2 wrapper as an editable problem sheet preview", async () => {
    const onApply = vi.fn();
    const onApplyEntries = vi.fn();
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={onApply}
        onApplyEntries={onApplyEntries}
      />,
    );
    const file = new File(
      [JSON.stringify(v2WrapperFixture)],
      "import.json",
      { type: "application/json" },
    );

    fireEvent.change(screen.getByLabelText("올인원 가져오기"), {
      target: { files: [file] },
    });

    expect(await screen.findByDisplayValue("Nswer N제 수학 II 1단원 함수의 극한과 연속")).toBeInTheDocument();
    expect(screen.queryByText(/순수 JSON 결과가 필요합니다/)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "개념 자료 JSON 변환" })).not.toBeInTheDocument();
    confirmDangerousImportIfShown();
    fireEvent.click(screen.getByRole("button", { name: "수정 후 저장" }));
    expect(onApply).not.toHaveBeenCalled();
    expect(onApplyEntries).toHaveBeenCalledWith(
      [expect.objectContaining({
        entryKind: "problem_sheet",
        answerKey: expect.arrayContaining([expect.objectContaining({ questionNumber: "18" })]),
        figures: expect.arrayContaining([expect.objectContaining({ source: "described_only", image: undefined })]),
        questionMeta: expect.arrayContaining([expect.objectContaining({ questionNumber: "7", important: true })]),
        learningBlocks: expect.any(Array),
      })],
      expect.any(Array),
    );
  }, 30000);

  it("opens a batch preview for a multi-entry v2 wrapper", async () => {
    const onApplyEntries = vi.fn().mockResolvedValue(undefined);
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={vi.fn()}
        onApplyEntries={onApplyEntries}
      />,
    );
    const wrapper = {
      schemaVersion: "wrong-answer-notebook-import-v2",
      importType: "mixed",
      title: "혼합 자료",
      subject: "수학",
      entries: [
        { entryKind: "problem_sheet", title: "시험지 A", subject: "수학", question: "1. 문제", answerKey: [{ questionNumber: "1", answer: "①" }] },
        { entryKind: "lecture", title: "특강 A", subject: "수학", learningBlocks: [{ type: "concept", title: "개념", content: "설명" }] },
      ],
    };
    const file = new File([JSON.stringify(wrapper)], "import.json", { type: "application/json" });

    fireEvent.change(screen.getByLabelText("올인원 가져오기"), {
      target: { files: [file] },
    });

    expect(await screen.findByRole("dialog", { name: "여러 항목 가져오기 미리보기" })).toBeInTheDocument();
    expect(screen.getByText("시험지 A")).toBeInTheDocument();
    expect(screen.getByText("특강 A")).toBeInTheDocument();
    screen.queryAllByText(/확인 권장 항목 .* 보기/).forEach((warningSummary) => fireEvent.click(warningSummary));
    const confirmation = await screen.findByLabelText(/확인 권장 항목을 모두 확인했습니다|확인 권장 항목을 모두 펼쳐 확인했습니다/);
    await waitFor(() => expect(confirmation).not.toBeDisabled());
    fireEvent.click(confirmation);
    const saveBatchButton = screen.getByRole("button", { name: "2개 항목 저장" });
    expect(saveBatchButton).not.toBeDisabled();
    fireEvent.click(saveBatchButton);
    await waitFor(() => expect(onApplyEntries).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ entryKind: "problem_sheet", title: "시험지 A" }),
        expect.objectContaining({ entryKind: "lecture", title: "특강 A" }),
      ]),
    ));
  }, 30000);

  it("shows the strict JSON error only when an all-in-one file cannot be parsed", async () => {
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={vi.fn()}
      />,
    );
    const file = new File(["JSON 아님"], "import.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("올인원 가져오기"), {
      target: { files: [file] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "JSON 형식으로 읽지 못했습니다. 코드블록이나 설명 문장이 섞였는지 확인하세요.",
    );
  });

  it("keeps apply disabled for empty input", () => {
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "수정 후 저장" })).toBeDisabled();
  });

  it("quick-saves a validated structured draft once and closes only after success", async () => {
    const onApplyEntries = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={onClose}
        onApply={vi.fn()}
        onApplyEntries={onApplyEntries}
      />,
    );

    fireEvent.change(screen.getByLabelText("올인원 가져오기"), {
      target: { files: [quickSaveFixtureFile()] },
    });

    const quickSave = await screen.findByRole("button", { name: "바로 저장" });
    await waitFor(() => expect(quickSave).not.toBeDisabled());
    fireEvent.click(quickSave);
    await waitFor(() => expect(onApplyEntries).toHaveBeenCalledTimes(1));
    expect(onApplyEntries).toHaveBeenCalledWith(
      [expect.objectContaining({ structuredQuestions: expect.any(Array) })],
      [],
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("edits the canonical structured draft in the fullscreen review workspace", async () => {
    const onApplyEntries = vi.fn().mockResolvedValue(undefined);
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={vi.fn()}
        onApplyEntries={onApplyEntries}
      />,
    );

    fireEvent.change(screen.getByLabelText("올인원 가져오기"), {
      target: { files: [quickSaveFixtureFile()] },
    });
    const openReview = await screen.findByRole("button", { name: "전체 화면 검수" });
    await waitFor(() => expect(openReview).not.toBeDisabled());
    fireEvent.click(openReview);

    const workspace = screen.getByRole("dialog", { name: /검수$/ });
    const questionText = within(workspace).getByLabelText("1번 본문");
    fireEvent.change(questionText, { target: { value: "수정된 canonical 본문" } });
    fireEvent.click(within(workspace).getByRole("button", { name: "바로 저장" }));

    await waitFor(() => expect(onApplyEntries).toHaveBeenCalledTimes(1));
    expect(onApplyEntries).toHaveBeenCalledWith([
      expect.objectContaining({
        structuredQuestions: [expect.objectContaining({ questionText: "수정된 canonical 본문" })],
      }),
    ], []);
  });

  it("guards a pending quick save synchronously and allows retry after failure", async () => {
    let rejectFirst: ((reason?: unknown) => void) | undefined;
    const first = new Promise<void>((_resolve, reject) => { rejectFirst = reject; });
    const onApplyEntries = vi.fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(undefined);
    const onClose = vi.fn();
    render(
      <ImportFromGptModal fallbackSubject="수학" onClose={onClose} onApply={vi.fn()} onApplyEntries={onApplyEntries} />,
    );
    fireEvent.change(screen.getByLabelText("올인원 가져오기"), {
      target: { files: [quickSaveFixtureFile()] },
    });
    const quickSave = await screen.findByRole("button", { name: "바로 저장" });
    expect(screen.queryByText("답안지 미리보기")).not.toBeInTheDocument();
    expect(screen.queryByText("도표/그림 미리보기")).not.toBeInTheDocument();
    await waitFor(() => expect(quickSave).not.toBeDisabled());
    fireEvent.click(quickSave);
    fireEvent.click(quickSave);
    expect(onApplyEntries).toHaveBeenCalledTimes(1);
    rejectFirst?.(new Error("저장 실패"));
    expect(await screen.findByText("저장 실패")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "바로 저장" });
    await waitFor(() => expect(retry).not.toBeDisabled());
    fireEvent.click(retry);
    await waitFor(() => expect(onApplyEntries).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("keeps the quick-save modal and structured draft open after a save failure", async () => {
    const onApplyEntries = vi.fn().mockRejectedValue(new Error("저장 실패"));
    const onClose = vi.fn();
    render(
      <ImportFromGptModal fallbackSubject="수학" onClose={onClose} onApply={vi.fn()} onApplyEntries={onApplyEntries} />,
    );
    fireEvent.change(screen.getByLabelText("올인원 가져오기"), {
      target: { files: [quickSaveFixtureFile()] },
    });
    const quickSave = await screen.findByRole("button", { name: "바로 저장" });
    await waitFor(() => expect(quickSave).not.toBeDisabled());
    fireEvent.click(quickSave);
    expect(await screen.findByText("저장 실패")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "바로 저장" })).toBeInTheDocument();
  });

  it("blocks duplicate canonical question numbers before quick save", async () => {
    const onApplyEntries = vi.fn();
    render(
      <ImportFromGptModal fallbackSubject="수학" onClose={vi.fn()} onApply={vi.fn()} onApplyEntries={onApplyEntries} />,
    );
    fireEvent.change(screen.getByLabelText("올인원 가져오기"), {
      target: { files: [structuredFixtureFile([
        { questionNumber: "01", questionText: "첫 문제", choices: [], conditions: [], equations: [], contentSegments: [], figureIds: [] },
        { questionNumber: "1번", questionText: "중복 문제", choices: [], conditions: [], equations: [], contentSegments: [], figureIds: [] },
      ])] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("duplicates question number 1");
    expect(onApplyEntries).not.toHaveBeenCalled();
  });

  it("shows malformed structured questions as an indexed import error", async () => {
    const onApplyEntries = vi.fn();
    render(
      <ImportFromGptModal fallbackSubject="수학" onClose={vi.fn()} onApply={vi.fn()} onApplyEntries={onApplyEntries} />,
    );
    fireEvent.change(screen.getByLabelText("올인원 가져오기"), {
      target: { files: [structuredFixtureFile([{}])] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("structuredQuestions[0]");
    expect(onApplyEntries).not.toHaveBeenCalled();
  });

  it("invalidates warning confirmation when the confirmable issue fingerprint changes", async () => {
    render(
      <ImportFromGptModal fallbackSubject="수학" onClose={vi.fn()} onApply={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("GPT 답변 붙여넣기"), {
      target: { value: JSON.stringify({
        question: "1. 문제",
        rejectedNotes: ["학생 필기"],
        audit: { expectedQuestionNumbers: ["1"], detectedQuestionNumbers: ["1"], missingQuestionNumbers: [], uncertainQuestionNumbers: [], handwritingExcluded: false, needsReviewCount: 0 },
        figures: [{ questionNumber: "1", title: "그래프", caption: "확인 필요" }],
      }) },
    });
    const confirmation = await screen.findByLabelText(/손글씨\/도표 연결 위험 항목을 확인했습니다/);
    fireEvent.click(confirmation);
    expect(confirmation).toBeChecked();
    fireEvent.change(screen.getByLabelText("본문"), { target: { value: "1. 문제 학생 필기" } });
    await waitFor(() => expect(confirmation).not.toBeChecked());
    expect(screen.getByRole("button", { name: "수정 후 저장" })).toBeDisabled();
  });

  it("opens GPT MCP settings from the import modal", () => {
    const onOpenSettings = vi.fn();
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={vi.fn()}
        onOpenSettings={onOpenSettings}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "설정" }));
    expect(onOpenSettings).toHaveBeenCalledWith("gpt-mcp");
  });

  it("applies gptMcpPreferences to review and detail expand defaults", () => {
    render(
      <ImportFromGptModal
        fallbackSubject="수학"
        onClose={vi.fn()}
        onApply={vi.fn()}
        gptMcpPreferences={{
          mcpShareScope: "current-question",
          importReviewExpanded: false,
          importDetailCollapsedByDefault: false,
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("GPT 답변 붙여넣기"), {
      target: {
        value: JSON.stringify({
          question: "1. 문제",
          answerKey: [
            {
              id: "a1",
              questionNumber: "1",
              answer: "①",
              explanation: "풀이",
              strategy: "전략",
              steps: [],
              choiceJudgements: [],
              importantPoints: [],
              concepts: [],
            },
          ],
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

    const review = document.querySelector(".import-validation-report");
    const detail = document.querySelector(".import-answer-details");
    expect(review).not.toHaveAttribute("open");
    expect(detail).toHaveAttribute("open");
  });

});
