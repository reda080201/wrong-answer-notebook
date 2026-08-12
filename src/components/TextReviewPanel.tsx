import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WrongAnswerEntry } from "../types";
import type { SuspiciousTextSegment } from "../utils/suspiciousText";
import ImageGallery from "./ImageGallery";
import Dialog from "../shared/ui/Dialog";
import "./TextReviewPanel.css";

export interface TextReviewPanelProps {
  entry: WrongAnswerEntry;
  segments: SuspiciousTextSegment[];
  onClose: () => void;
  onSave: (text: string) => Promise<void> | void;
  /** Additive extension point for problem-sheet integrations. */
  activeQuestionNumber?: string;
  activeSegmentId?: string;
  activeQuestionEditor?: ReactNode;
  activeSegmentEditor?: ReactNode;
  onActiveQuestionChange?: (questionNumber: string) => void;
  onActiveSegmentChange?: (segmentId: string) => void;
}

export default function TextReviewPanel({
  entry,
  segments,
  onClose,
  onSave,
  activeQuestionNumber: requestedQuestionNumber,
  activeSegmentId: requestedSegmentId,
  activeQuestionEditor,
  activeSegmentEditor,
  onActiveQuestionChange,
  onActiveSegmentChange,
}: TextReviewPanelProps) {
  const questionNumbers = useMemo(
    () => Object.keys(entry.questionContentSegments ?? {}).filter((number) => number.trim()),
    [entry.questionContentSegments],
  );
  const isStructured = entry.entryKind === "problem_sheet" && questionNumbers.length > 0;
  const [text, setText] = useState(entry.question);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [selectedQuestionNumber, setSelectedQuestionNumber] = useState(
    requestedQuestionNumber ?? questionNumbers[0] ?? null,
  );
  const [selectedStructuredSegmentId, setSelectedStructuredSegmentId] = useState<string | null>(requestedSegmentId ?? null);
  const [ignoredSegmentIds, setIgnoredSegmentIds] = useState<Set<string>>(() => new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setText(entry.question);
    setError(null);
    setSelectedSegmentId(null);
    setIgnoredSegmentIds(new Set());
  }, [entry.id, entry.question]);

  useEffect(() => {
    if (requestedQuestionNumber && questionNumbers.includes(requestedQuestionNumber)) {
      setSelectedQuestionNumber(requestedQuestionNumber);
    }
  }, [questionNumbers, requestedQuestionNumber]);

  useEffect(() => {
    if (requestedSegmentId) setSelectedStructuredSegmentId(requestedSegmentId);
  }, [requestedSegmentId]);

  const visibleSegments = useMemo(
    () => segments.filter((segment) => !ignoredSegmentIds.has(segment.id)),
    [ignoredSegmentIds, segments],
  );

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(text);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "텍스트 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const requestClose = () => {
    if (!saving) onClose();
  };

  const selectSegment = (segment: SuspiciousTextSegment) => {
    setSelectedSegmentId(segment.id);
    const textarea = textareaRef.current;
    textarea?.focus();
    textarea?.setSelectionRange(segment.start, segment.end);
  };

  const selectQuestion = (questionNumber: string) => {
    setSelectedQuestionNumber(questionNumber);
    setSelectedStructuredSegmentId(null);
    onActiveQuestionChange?.(questionNumber);
  };

  const selectStructuredSegment = (segmentId: string) => {
    setSelectedStructuredSegmentId(segmentId);
    onActiveSegmentChange?.(segmentId);
  };

  const copyForGptCorrection = async () => {
    const body = [
      "원본 이미지 기준으로만 아래 OCR 텍스트의 의심 구간을 교정해줘.",
      "추측으로 내용을 추가하지 말고, 확실하지 않은 부분은 [검토 필요]로 표시해줘.",
      "",
      "의심 구간:",
      ...visibleSegments.map((segment) => `- ${segment.reason}: ${segment.text}`),
      "",
      "전체 텍스트:",
      text,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(body);
      setError("GPT 교정용 텍스트를 복사했습니다.");
    } catch {
      setError("클립보드 복사에 실패했습니다.");
    }
  };

  return (
    <Dialog open onClose={requestClose} className={`text-review-panel ${isStructured ? "text-review-panel--structured" : "text-review-panel--drawer"}`} ariaLabel="텍스트 검수" closeDisabled={saving} busy={saving}>
        <header className="modal-head">
          <div>
            <span className="modal-eyebrow">Text Review</span>
            <h2>텍스트 검수</h2>
          </div>
          <div className="text-review-head-actions">
            {!isStructured && <button type="button" className="btn-secondary" onClick={handleSave} disabled={saving}>
              {saving ? "저장 중..." : "수정 저장"}
            </button>}
            <button type="button" className="btn-icon" onClick={requestClose} disabled={saving}>
              닫기
            </button>
          </div>
        </header>

        <div className="text-review-warning" role="status" tabIndex={0}>
          자동으로 고치지 않습니다. 원본 이미지를 기준으로 의심 문장을 직접 확인한 뒤 저장하세요.
        </div>

        {isStructured ? (
          <div className="text-review-structured-layout">
            <nav className="text-review-question-nav" aria-label="문항 선택">
              <h3>문항</h3>
              <ol>
                {questionNumbers.map((questionNumber) => (
                  <li key={questionNumber}>
                    <button type="button" className={selectedQuestionNumber === questionNumber ? "is-active" : ""} aria-current={selectedQuestionNumber === questionNumber ? "true" : undefined} onClick={() => selectQuestion(questionNumber)}>
                      {questionNumber}번
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
            <section className="text-review-structured-editor" aria-label="구조화된 문제 편집 영역">
              <div className="text-review-structured-heading">
                <div><span className="modal-eyebrow">Structured Review</span><h3>{selectedQuestionNumber ? `${selectedQuestionNumber}번 문항` : "문항 선택"}</h3></div>
                <span className="text-review-slot-status">편집 슬롯 대기 중</span>
              </div>
              {activeQuestionEditor ? <div className="text-review-slot" aria-label="활성 문항 편집기">{activeQuestionEditor}</div> : <p className="text-review-placeholder">활성 문항 편집기가 연결되면 이 영역에 표시됩니다.</p>}
              <div className="text-review-segment-list" aria-label="활성 문항 segment 선택">
                <strong>문항 구성</strong>
                <ul>
                  {(entry.questionContentSegments?.[selectedQuestionNumber ?? ""] ?? []).map((segment) => (
                    <li key={segment.id}>
                      <button type="button" className={selectedStructuredSegmentId === segment.id ? "is-active" : ""} aria-current={selectedStructuredSegmentId === segment.id ? "true" : undefined} onClick={() => selectStructuredSegment(segment.id)}>
                        <span>{segment.type}</span>{segment.type === "text" || segment.type === "condition" ? segment.text.slice(0, 64) : segment.id}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              {activeSegmentEditor ? <div className="text-review-slot" aria-label="활성 segment 편집기">{activeSegmentEditor}</div> : <p className="text-review-placeholder">활성 segment 편집기가 연결되면 이 영역에 표시됩니다.</p>}
            </section>
          </div>
        ) : (
          <div className="text-review-grid">
            <section className="text-review-editor" aria-label="문제 텍스트 수정">
              <h3>문제 본문 편집</h3>
              <textarea ref={textareaRef} id="text-review-question" value={text} onChange={(event) => setText(event.target.value)} aria-label="검수할 문제 텍스트" />
              {error && <div className="form-error">{error}</div>}
            </section>

          <aside className="text-review-segments" aria-label="의심 구간 목록">
            <div className="text-review-segments">
              <strong>의심 구간 {visibleSegments.length}개</strong>
              {visibleSegments.length ? (
                <ul>
                  {visibleSegments.map((segment) => (
                    <li key={segment.id} className={selectedSegmentId === segment.id ? "active" : ""}>
                      <span>{segment.reason}</span>
                      <button type="button" aria-label={`${segment.reason}: ${segment.text}`} onClick={() => selectSegment(segment)}>
                        {segment.text.slice(0, 36)}
                      </button>
                      <button
                        type="button"
                        className="text-review-ignore"
                        onClick={() =>
                          setIgnoredSegmentIds((current) => new Set([...current, segment.id]))
                        }
                      >
                        이 구간 무시
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>의심 구간이 없습니다.</p>
              )}
            </div>
            <div className="text-review-segment-actions">
              <button type="button" className="btn-secondary" onClick={() => setIgnoredSegmentIds(new Set(segments.map((segment) => segment.id)))}>
                전체 무시
              </button>
              <button type="button" className="btn-secondary" onClick={copyForGptCorrection}>
                GPT 교정용으로 복사
              </button>
            </div>
          </aside>

          <section className="text-review-images" aria-label="원본 이미지">
            <h3>원본 이미지</h3>
            {entry.questionImages.length ? (
              <ImageGallery filenames={entry.questionImages} variant="fill" />
            ) : (
              <p className="learning-content-empty">
                원본 이미지가 없어 자동 비교는 어렵습니다. 의심 구간을 클릭하면 문제 본문에서 해당 위치로 이동합니다.
              </p>
            )}
          </section>
          </div>
        )}

        <footer className="modal-actions">
          <button type="button" className="btn-secondary" onClick={requestClose} disabled={saving}>
            취소
          </button>
          {!isStructured && <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "저장 중..." : "검수한 텍스트 저장"}
          </button>}
        </footer>
    </Dialog>
  );
}
