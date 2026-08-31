import { useRef, useState } from "react";
import { FileImage, FileText, Upload, X } from "lucide-react";
import type { LearningBlock, LectureSourceType, SheetFigureItem } from "../types";
import type { EntryFormData } from "../types";
import {
  parseLectureImportText,
  readLectureImportFile,
} from "../utils/learningContent";
import {
  isAppCompatibleEntriesJson,
  isConceptKnowledgeJson,
  tryParseConceptKnowledgeText,
} from "../utils/conceptKnowledgeImport";
import MathText from "./MathText";
import ConceptImportPreviewModal from "./ConceptImportPreviewModal";
import Dialog from "../shared/ui/Dialog";
import type { ImportAssetSessionManifest } from "../features/import-workspace/model/importWorkspace";

export type LearningImportIssueSeverity = "blocking" | "review_required" | "informational";

export interface LearningImportIssue {
  severity: LearningImportIssueSeverity;
  message: string;
  path?: string;
}

export interface LearningImportAnalysis {
  title?: string;
  blocks: LearningBlock[];
  sourcePageImages: string[];
  figures: SheetFigureItem[];
  counts: {
    questions: number;
    images: number;
    machineChecked: number;
    needsReview: number;
  };
  issues: LearningImportIssue[];
  /** Assets are intentionally transient until the user confirms saving. */
  assetFiles?: File[];
  assetSession?: ImportAssetSessionManifest;
}

export interface ImportTaskProgress {
  phase: "rasterizing" | "staging" | "analyzing" | "validating";
  label: string;
  current?: number;
  total?: number;
  indeterminate?: boolean;
}

export interface LearningImportMeta {
  title: string;
  sourceType: LectureSourceType;
  sourcePageImages?: string[];
  figures?: SheetFigureItem[];
  issues?: LearningImportIssue[];
  assetFiles?: File[];
  assetSession?: ImportAssetSessionManifest;
}

interface LearningImportModalProps {
  onClose: () => void;
  onApply: (blocks: LearningBlock[], meta: LearningImportMeta) => Promise<void> | void;
  onApplyEntries?: (entries: Partial<EntryFormData>[]) => Promise<void> | void;
  mode?: "append" | "lecture";
  onVisualFile?: (file: File, options: { signal: AbortSignal; onProgress(progress: ImportTaskProgress): void }) => Promise<LearningImportAnalysis>;
  onDiscardVisualAssets?: (analysis: LearningImportAnalysis) => Promise<void>;
}

export default function LearningImportModal({ onClose, onApply, onApplyEntries, mode = "append", onVisualFile, onDiscardVisualAssets }: LearningImportModalProps) {
  const [rawText, setRawText] = useState("");
  const [blocks, setBlocks] = useState<LearningBlock[]>([]);
  const [conceptImportValue, setConceptImportValue] = useState<unknown | null>(null);
  const [meta, setMeta] = useState<{ title: string; sourceType: LectureSourceType }>({
    title: "가져온 특강자료",
    sourceType: "txt",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"visual" | "file" | "text">("file");
  const [visualFileName, setVisualFileName] = useState<string | null>(null);
  const [visualAnalysis, setVisualAnalysis] = useState<LearningImportAnalysis | null>(null);
  const [showReviewOnly, setShowReviewOnly] = useState(false);
  const [progress, setProgress] = useState<ImportTaskProgress | null>(null);
  const visualInputRef = useRef<HTMLInputElement>(null);
  const visualAbortRef = useRef<AbortController | null>(null);

  const discardVisualAnalysis = async (analysis: LearningImportAnalysis | null) => {
    if (analysis) await onDiscardVisualAssets?.(analysis);
  };

  const parseText = (text: string, filename?: string) => {
    try {
      setVisualAnalysis(null);
      const conceptValue = tryParseConceptKnowledgeText(text);
      if (conceptValue && (isConceptKnowledgeJson(conceptValue) || isAppCompatibleEntriesJson(conceptValue))) {
        setConceptImportValue(conceptValue);
        setBlocks([]);
        setError(null);
        return;
      }
      setConceptImportValue(null);
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
      setVisualAnalysis(null);
      const parsed = await readLectureImportFile(file);
      const text = await file.text();
      const conceptValue = tryParseConceptKnowledgeText(text);
      setRawText(text);
      if (conceptValue && (isConceptKnowledgeJson(conceptValue) || isAppCompatibleEntriesJson(conceptValue))) {
        setConceptImportValue(conceptValue);
        setBlocks([]);
        setError(null);
        return;
      }
      setConceptImportValue(null);
      setBlocks(parsed.blocks);
      setMeta({ title: parsed.title, sourceType: parsed.sourceType });
      setError(parsed.blocks.length ? null : "가져올 학습 블록을 찾지 못했습니다.");
    } catch (err) {
      setBlocks([]);
      setError(err instanceof Error ? err.message : "특강 파일을 읽지 못했습니다.");
    }
  };

  const handleVisualFile = async (file?: File) => {
    if (!file) return;
    setVisualFileName(file.name);
    setError(null);
    if (!onVisualFile) {
      setError("이미지/PDF 분석 연결을 사용할 수 없습니다. 데스크톱 앱의 AI 분석 설정을 확인해 주세요.");
      return;
    }
    const previousAnalysis = visualAnalysis;
    visualAbortRef.current?.abort();
    const controller = new AbortController();
    visualAbortRef.current = controller;
    try {
      setSaving(true);
      setProgress({ phase: "rasterizing", label: "원본 페이지를 준비하고 있습니다.", indeterminate: true });
      const parsed = await onVisualFile(file, { signal: controller.signal, onProgress: setProgress });
      if (controller.signal.aborted) {
        await discardVisualAnalysis(parsed);
        return;
      }
      await discardVisualAnalysis(previousAnalysis);
      setBlocks(parsed.blocks);
      setVisualAnalysis(parsed);
      setMeta((current) => ({ ...current, title: parsed.title || file.name.replace(/\.[^.]+$/, ""), sourceType: "json" }));
    } catch (err) {
      if (controller.signal.aborted) {
        await discardVisualAnalysis(previousAnalysis);
        return;
      }
      await discardVisualAnalysis(previousAnalysis);
      setBlocks([]);
      setVisualAnalysis(null);
      setError(err instanceof Error ? err.message : "이미지/PDF에서 학습 내용을 추출하지 못했습니다.");
    } finally {
      if (visualAbortRef.current === controller) visualAbortRef.current = null;
      setProgress(null);
      setSaving(false);
    }
  };

  const handleApply = async () => {
    if (!blocks.length) return;
    setSaving(true);
    try {
      if (visualAnalysis?.issues.some((issue) => issue.severity === "blocking")) {
        setError("저장 전에 차단된 검토 항목을 해결해야 합니다.");
        return;
      }
      await onApply(blocks, {
        ...meta,
        sourcePageImages: visualAnalysis?.sourcePageImages,
        figures: visualAnalysis?.figures,
        issues: visualAnalysis?.issues,
        assetFiles: visualAnalysis?.assetFiles,
        assetSession: visualAnalysis?.assetSession,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "특강 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const requestClose = () => {
    visualAbortRef.current?.abort();
    if (!saving) {
      void discardVisualAnalysis(visualAnalysis).finally(onClose);
    }
  };

  const cancelVisualAnalysis = () => {
    visualAbortRef.current?.abort();
    setProgress(null);
  };

  return (
    <Dialog open onClose={requestClose} className="learning-import-modal" ariaLabel="특강 가져오기" closeDisabled={saving} busy={saving} title={mode === "lecture" ? "특강자료 가져오기" : "특강 내용 가져오기"} header={<button type="button" className="ui-icon-button" onClick={requestClose} disabled={saving} aria-label="특강 가져오기 닫기" title="닫기"><X size={18} aria-hidden="true" /></button>} footer={<><button type="button" className="btn-secondary" onClick={requestClose} disabled={saving}>취소</button><button type="button" className="btn-primary" onClick={handleApply} disabled={!blocks.length || saving}>{saving ? "저장 중..." : "특강 저장"}</button></>}>
        <nav className="learning-import-tabs" aria-label="특강 가져오기 방식">
          <button type="button" className={activeTab === "visual" ? "active" : ""} aria-pressed={activeTab === "visual"} onClick={() => setActiveTab("visual")}><FileImage size={16} aria-hidden="true" /> 이미지/PDF</button>
          <button type="button" className={activeTab === "file" ? "active" : ""} aria-pressed={activeTab === "file"} onClick={() => setActiveTab("file")}><FileText size={16} aria-hidden="true" /> 파일</button>
          <button type="button" className={activeTab === "text" ? "active" : ""} aria-pressed={activeTab === "text"} onClick={() => setActiveTab("text")}><span aria-hidden="true">T</span> 텍스트 붙여넣기</button>
        </nav>

        <div className="learning-import-grid">
          <section className="learning-import-input">
            {activeTab === "visual" ? <>
              <input ref={visualInputRef} className="visually-hidden" type="file" accept=".pdf,image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => void handleVisualFile(event.target.files?.[0])} />
              <button type="button" className="learning-import-dropzone" onClick={() => visualInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void handleVisualFile(event.dataTransfer.files[0]); }}>
                <Upload size={22} aria-hidden="true" /><strong>이미지 또는 PDF를 놓거나 선택하세요</strong><span>PNG, JPG, WEBP, PDF · AI가 학습 블록 후보를 추출합니다.</span>
                {visualFileName && <small>선택됨: {visualFileName}</small>}
              </button>
              {saving && progress && <div className="learning-import-progress" role="status"><span>{progress.label}</span>{progress.total && <span>{progress.current ?? 0} / {progress.total}</span>}<button type="button" className="btn-ghost" onClick={cancelVisualAnalysis}>분석 취소</button></div>}
            </> : <>
            {activeTab === "file" && <><label htmlFor="learning-import-file">파일 선택</label><input id="learning-import-file" type="file" accept=".html,.txt,.md,.json,text/html,text/plain,text/markdown,application/json" onChange={(event) => void handleFile(event.target.files?.[0])} /></>}
            {activeTab === "text" && <label htmlFor="learning-import-text">텍스트 붙여넣기</label>}
            <label htmlFor="learning-import-title">자료 제목</label>
            <input
              id="learning-import-title"
              value={meta.title}
              onChange={(event) => setMeta((current) => ({ ...current, title: event.target.value }))}
              placeholder="특강자료 제목"
            />
            <textarea
              id="learning-import-text"
              hidden={activeTab !== "text"}
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
            </>}
            {error && <div className="form-error">{error}</div>}
          </section>

          <section className="learning-import-preview" aria-label="특강 미리보기">
            <h3>미리보기</h3>
            {visualAnalysis && (
              <div className="learning-import-analysis" aria-label="자동 분석 요약">
                <p>문항 {visualAnalysis.counts.questions}개 · 이미지 {visualAnalysis.counts.images}개 · 자동 추출 {visualAnalysis.counts.machineChecked}개 · 검토 필요 {visualAnalysis.counts.needsReview}개</p>
                {visualAnalysis.issues.length > 0 && <button type="button" className="btn-ghost" onClick={() => setShowReviewOnly((value) => !value)}>{showReviewOnly ? "전체 보기" : "검토 필요만 보기"}</button>}
                {visualAnalysis.issues.filter((issue) => !showReviewOnly || issue.severity !== "informational").map((issue, index) => (
                  <p key={`${issue.path ?? "issue"}-${index}`} className={`form-${issue.severity === "blocking" ? "error" : "hint"}`}>{issue.path ? `${issue.path}: ` : ""}{issue.message}</p>
                ))}
              </div>
            )}
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

      {Boolean(conceptImportValue) && onApplyEntries && (
        <ConceptImportPreviewModal
          value={conceptImportValue}
          fallbackSubject="기타"
          onClose={() => setConceptImportValue(null)}
          onApplyEntries={async (entries) => {
            await onApplyEntries(entries);
            onClose();
          }}
        />
      )}
    </Dialog>
  );
}
