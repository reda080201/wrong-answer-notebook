import { useMemo, useState } from "react";
import type { WrongAnswerEntry } from "../types";
import {
  buildGptExportPayload,
  type GptExportFormat,
  type GptExportRangeMode,
} from "../utils/gptExport";
import { getEntryTitle } from "../utils/entry";

interface GptExportModalProps {
  entry: WrongAnswerEntry;
  allEntries: WrongAnswerEntry[];
  currentQuestionNumber?: string;
  selectedQuestionNumbers?: string[];
  onClose: () => void;
  onCopied: () => void;
}

export default function GptExportModal({
  entry,
  allEntries,
  currentQuestionNumber,
  selectedQuestionNumbers = [],
  onClose,
  onCopied,
}: GptExportModalProps) {
  const [rangeMode, setRangeMode] = useState<GptExportRangeMode>(
    selectedQuestionNumbers.length ? "manual-range" : "current",
  );
  const [manualRange, setManualRange] = useState(selectedQuestionNumbers.join(", "));
  const [format, setFormat] = useState<GptExportFormat>("prompt");
  const [includeQuestion, setIncludeQuestion] = useState(true);
  const [includeChoices, setIncludeChoices] = useState(true);
  const [includeFigures, setIncludeFigures] = useState(true);
  const [includeAnswers, setIncludeAnswers] = useState(false);
  const [includeExplanations, setIncludeExplanations] = useState(false);
  const [includeWrongPoints, setIncludeWrongPoints] = useState(true);
  const [includeLearning, setIncludeLearning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const output = useMemo(
    () =>
      buildGptExportPayload({
        entry,
        allEntries,
        currentQuestionNumber,
        rangeMode,
        manualRange,
        format,
        includeQuestion,
        includeChoices,
        includeFigures,
        includeAnswers,
        includeExplanations,
        includeWrongPoints,
        includeLearning,
      }),
    [
      allEntries,
      currentQuestionNumber,
      entry,
      format,
      includeAnswers,
      includeChoices,
      includeExplanations,
      includeFigures,
      includeLearning,
      includeQuestion,
      includeWrongPoints,
      manualRange,
      rangeMode,
    ],
  );

  const copyOutput = async () => {
    try {
      await navigator.clipboard.writeText(output);
      onCopied();
    } catch {
      setError("클립보드 복사에 실패했습니다.");
    }
  };

  const downloadTxt = () => {
    const blob = new Blob([output], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${getEntryTitle(entry).replace(/[\\/:*?"<>|]/g, "_")}-gpt-export.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="GPT에게 보내기">
      <div className="gpt-export-modal">
        <header className="modal-head">
          <div>
            <span className="modal-eyebrow">GPT Export</span>
            <h2>GPT에게 보내기</h2>
          </div>
          <button type="button" className="btn-icon" onClick={onClose}>
            닫기
          </button>
        </header>

        <div className="gpt-export-grid">
          <section className="gpt-export-options">
            <label className="form-field">
              <span>범위</span>
              <select value={rangeMode} onChange={(event) => setRangeMode(event.target.value as GptExportRangeMode)}>
                <option value="current">현재 문제</option>
                <option value="manual-range">문제 번호 직접 선택</option>
                <option value="important-only">중요 문제만</option>
                <option value="whole-sheet">시험지 전체</option>
                <option value="whole-group" disabled={!entry.sheetGroup}>현재 시험지 묶음 전체</option>
              </select>
            </label>
            {rangeMode === "manual-range" && (
              <label className="form-field">
                <span>문제 번호</span>
                <input
                  value={manualRange}
                  onChange={(event) => setManualRange(event.target.value)}
                  placeholder="예: 1-5, 7, 10-12"
                />
              </label>
            )}
            <label className="form-field">
              <span>출력 형식</span>
              <select value={format} onChange={(event) => setFormat(event.target.value as GptExportFormat)}>
                <option value="prompt">GPT 질문 프롬프트</option>
                <option value="markdown">Markdown</option>
                <option value="json">JSON</option>
              </select>
            </label>
            <div className="gpt-export-checks">
              {[
                ["문제 본문", includeQuestion, setIncludeQuestion],
                ["선지", includeChoices, setIncludeChoices],
                ["도표/이미지 설명", includeFigures, setIncludeFigures],
                ["정답 포함", includeAnswers, setIncludeAnswers],
                ["기존 해설 포함", includeExplanations, setIncludeExplanations],
                ["오답 포인트 포함", includeWrongPoints, setIncludeWrongPoints],
                ["특강 내용 포함", includeLearning, setIncludeLearning],
              ].map(([label, checked, setter]) => (
                <label key={label as string} className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={checked as boolean}
                    onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)}
                  />
                  {label as string}
                </label>
              ))}
            </div>
          </section>

          <section className="gpt-export-preview">
            <textarea readOnly value={output} aria-label="GPT로 보낼 텍스트" />
            {error && <div className="form-error">{error}</div>}
          </section>
        </div>

        <footer className="modal-actions">
          <button type="button" className="btn-secondary" onClick={downloadTxt}>
            .txt 다운로드
          </button>
          <button type="button" className="btn-primary" onClick={copyOutput}>
            복사
          </button>
        </footer>
      </div>
    </div>
  );
}
