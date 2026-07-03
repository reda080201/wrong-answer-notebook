import { useEffect, useState } from "react";
import type { WrongAnswerEntry } from "../types";
import type { SuspiciousTextSegment } from "../utils/suspiciousText";
import ImageGallery from "./ImageGallery";

interface TextReviewPanelProps {
  entry: WrongAnswerEntry;
  segments: SuspiciousTextSegment[];
  onClose: () => void;
  onSave: (text: string) => Promise<void> | void;
}

export default function TextReviewPanel({ entry, segments, onClose, onSave }: TextReviewPanelProps) {
  const [text, setText] = useState(entry.question);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(entry.question);
    setError(null);
  }, [entry.id, entry.question]);

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

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="텍스트 검수">
      <div className="text-review-panel">
        <header className="modal-head">
          <div>
            <span className="modal-eyebrow">Text Review</span>
            <h2>텍스트 검수</h2>
          </div>
          <button type="button" className="btn-icon" onClick={onClose}>
            닫기
          </button>
        </header>

        <div className="text-review-warning">
          자동으로 고치지 않습니다. 원본 이미지를 기준으로 의심 문장을 직접 확인한 뒤 저장하세요.
        </div>

        <div className="text-review-grid">
          <section className="text-review-images" aria-label="원본 이미지">
            <h3>원본 이미지</h3>
            {entry.questionImages.length ? (
              <ImageGallery filenames={entry.questionImages} variant="fill" />
            ) : (
              <p className="learning-content-empty">비교할 원본 이미지가 없습니다.</p>
            )}
          </section>

          <section className="text-review-editor" aria-label="문제 텍스트 수정">
            <div className="text-review-segments">
              <strong>의심 구간 {segments.length}개</strong>
              {segments.length ? (
                <ul>
                  {segments.slice(0, 8).map((segment) => (
                    <li key={segment.id}>
                      <span>{segment.reason}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const textarea = document.getElementById("text-review-question") as HTMLTextAreaElement | null;
                          textarea?.focus();
                          textarea?.setSelectionRange(segment.start, segment.end);
                        }}
                      >
                        {segment.text.slice(0, 36)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>의심 구간이 없습니다.</p>
              )}
            </div>
            <textarea
              id="text-review-question"
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-label="검수할 문제 텍스트"
            />
            {error && <div className="form-error">{error}</div>}
          </section>
        </div>

        <footer className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            취소
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "저장 중..." : "검수한 텍스트 저장"}
          </button>
        </footer>
      </div>
    </div>
  );
}
