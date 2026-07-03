import { useState } from "react";
import type { LearningBlock, LectureSourceType } from "../types";
import {
  parseLectureImportText,
  readLectureImportFile,
} from "../utils/learningContent";
import MathText from "./MathText";

interface LearningImportModalProps {
  onClose: () => void;
  onApply: (blocks: LearningBlock[], meta: { title: string; sourceType: LectureSourceType }) => Promise<void> | void;
  mode?: "append" | "lecture";
}

export default function LearningImportModal({ onClose, onApply, mode = "append" }: LearningImportModalProps) {
  const [rawText, setRawText] = useState("");
  const [blocks, setBlocks] = useState<LearningBlock[]>([]);
  const [meta, setMeta] = useState<{ title: string; sourceType: LectureSourceType }>({
    title: "가져온 특강자료",
    sourceType: "txt",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const parseText = (text: string, filename?: string) => {
    try {
      const parsed = parseLectureImportText(text, filename);
      setBlocks(parsed.blocks);
      setMeta({ title: parsed.title, sourceType: parsed.sourceType });
      setError(parsed.blocks.length ? null : "가져올 학습 블록을 찾지 못했습니다.");
    } catch (err) {
      setBlocks([]);
      setError(err instanceof Error ? err.message : "특강 내용을 해석하지 못했습니다.");
    }
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = await readLectureImportFile(file);
      setRawText(await file.text());
      setBlocks(parsed.blocks);
      setMeta({ title: parsed.title, sourceType: parsed.sourceType });
      setError(parsed.blocks.length ? null : "가져올 학습 블록을 찾지 못했습니다.");
    } catch (err) {
      setBlocks([]);
      setError(err instanceof Error ? err.message : "특강 파일을 읽지 못했습니다.");
    }
  };

  const handleApply = async () => {
    if (!blocks.length) return;
    setSaving(true);
    try {
      await onApply(blocks, meta);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "특강 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="특강 가져오기">
      <div className="learning-import-modal">
        <header className="modal-head">
          <div>
            <span className="modal-eyebrow">Learning Import</span>
            <h2>{mode === "lecture" ? "특강자료 가져오기" : "HTML/JSON 특강 가져오기"}</h2>
          </div>
          <button type="button" className="btn-icon" onClick={onClose}>
            닫기
          </button>
        </header>

        <div className="learning-import-grid">
          <section className="learning-import-input">
            <label htmlFor="learning-import-file">파일 선택</label>
            <input
              id="learning-import-file"
              type="file"
              accept=".html,.txt,.md,.json,text/html,text/plain,text/markdown,application/json"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <label htmlFor="learning-import-text">붙여넣기</label>
            <label htmlFor="learning-import-title">자료 제목</label>
            <input
              id="learning-import-title"
              value={meta.title}
              onChange={(event) => setMeta((current) => ({ ...current, title: event.target.value }))}
              placeholder="특강자료 제목"
            />
            <textarea
              id="learning-import-text"
              value={rawText}
              onChange={(event) => {
                setRawText(event.target.value);
                parseText(event.target.value);
              }}
              placeholder="HTML, Markdown, 텍스트, learningBlocks JSON을 붙여넣으세요."
            />
            <p className="form-hint">
              script, iframe, style, raw SVG, 이미지 태그는 저장하지 않고 안전한 텍스트 학습 블록만 변환합니다.
            </p>
            {error && <div className="form-error">{error}</div>}
          </section>

          <section className="learning-import-preview" aria-label="특강 미리보기">
            <h3>미리보기</h3>
            {blocks.length ? (
              <div className="learning-import-blocks">
                {blocks.map((block) => (
                  <article key={block.id} className={`learning-card ${block.type}-card`}>
                    <span className="formula-chip">{block.type}</span>
                    <h4>{block.title}</h4>
                    <MathText text={block.content} />
                  </article>
                ))}
              </div>
            ) : (
              <p className="learning-content-empty">변환된 학습 블록이 아직 없습니다.</p>
            )}
          </section>
        </div>

        <footer className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            취소
          </button>
          <button type="button" className="btn-primary" onClick={handleApply} disabled={!blocks.length || saving}>
            {saving ? "저장 중..." : "특강 저장"}
          </button>
        </footer>
      </div>
    </div>
  );
}
