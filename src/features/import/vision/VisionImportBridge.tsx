import AssessmentCard from "./AssessmentCard";
import { mapVisionAssessment } from "./assessmentMapping";
import { useEffect, useMemo, useRef, useState } from "react";
import { createVisionJob, type VisionJobDraft } from "./visionJob";
import { parseVisionAnalysis } from "./visionSchema";
import { downloadBlob } from "../../export/services/questionExport";

export function VisionImportBridge({ initialAnalysis = "", initialFiles = [], expectedSources, autoOpen = true, initialDraftText, onDraftChange, disabled = false }: { initialAnalysis?: string; initialFiles?: File[]; expectedSources?: VisionJobDraft["sourceFiles"]; autoOpen?: boolean; initialDraftText?: string; onDraftChange?(text: string): void; disabled?: boolean }) {
  const [analysis, setAnalysis] = useState(initialDraftText ?? initialAnalysis);
  const [files, setFiles] = useState(initialFiles);
  const validated = useMemo(() => { try { return parseVisionAnalysis(analysis); } catch { return null; } }, [analysis]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorDetails, setErrorDetails] = useState("");
  const lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const command = "python -m tools.diagram_pipeline run-vision --job vision-job.zip --out-dir build/vision-run-001";
  const exportJob = async () => {
    if (lock.current) return;
    lock.current = true; controller.current = new AbortController(); setBusy(true); setMessage(""); setErrorDetails("");
    try { const blob = await createVisionJob(analysis, files, controller.current.signal, expectedSources); downloadBlob(blob, "vision-job.zip"); setMessage("작업 묶음을 저장했습니다. Python 3.12 환경에서 명령을 실행한 뒤 output-import-v2.zip을 파일 / ZIP / JSON 탭에서 가져오세요."); }
    catch (error) { if (controller.current?.signal.aborted) return; setMessage("작업 묶음을 만들지 못했습니다. 입력은 유지됩니다. 원본 파일과 오류 상세를 확인한 뒤 다시 시도해 주세요."); setErrorDetails(error instanceof Error ? error.message : String(error)); }
    finally { lock.current = false; setBusy(false); }
  };
  return <details className="import-advanced-settings" open={autoOpen && Boolean(initialAnalysis)}>
    <summary>PNG 생성 작업 묶음 · 로컬 CLI</summary>
    <p className="form-hint">분석 JSON은 그림 생성 완료를 뜻하지 않습니다. 원본 사용은 가능하며 자동 정리는 아래 명령으로 별도 실행합니다. 앱이 Python을 직접 실행하지 않습니다.</p>
    {validated?.schemaVersion === "wrong-answer-notebook-vision-v2" && <details><summary>생성 전 풀이·평가 {validated.entries.reduce((sum,entry) => sum + entry.questions.length,0)}문항 확인</summary>{validated.entries.flatMap(entry => entry.questions.map(question => { const mapped = mapVisionAssessment(question, question.questionKey, new Date().toISOString()); return mapped.meta && <AssessmentCard key={`${entry.entryKey}/${question.questionKey}`} meta={mapped.meta} answer={mapped.answer} />; }))}</details>}
    <label className="form-field">v8 관측 JSON<textarea aria-label="v8 관측 JSON" rows={5} value={analysis} disabled={busy || disabled} onChange={event => { setAnalysis(event.target.value); onDraftChange?.(event.target.value); setMessage(""); setErrorDetails(""); }} /></label>
    <label className="form-field">원본 PDF·이미지 (sources 순서)<input aria-label="v8 원본 파일" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp" disabled={busy || disabled} onChange={event => { setFiles(Array.from(event.target.files ?? [])); setMessage(""); setErrorDetails(""); }} /></label>
    {files.length > 0 && <ol aria-label="원본 파일 순서">{files.map((file, index) => <li key={`${index}-${file.name}`} style={{ overflowWrap: "anywhere" }}>{file.name}</li>)}</ol>}
    <p className="form-hint">{files.length ? `원본 ${files.length}개 선택됨` : "재진입 시 원본 파일을 다시 선택하세요. 원본 바이트와 해시는 작업 묶음에 보존됩니다."}</p>
    <button type="button" className="btn-secondary btn-sm" disabled={!analysis.trim() || busy || disabled} onClick={() => downloadBlob(new Blob([analysis], { type: "application/json" }), "vision-analysis.json")}>관측 JSON 보관</button>
    <div className="dialog-actions"><button type="button" className="btn-secondary" disabled={busy || disabled || !analysis.trim()} onClick={() => { try { setErrorDetails(""); const value = parseVisionAnalysis(analysis); setMessage(`관측 ${value.entries.reduce((n, e) => n + e.questions.length, 0)}문항 · 그림 ${value.figures.length}개. 파일 검사 전 · 사용자 비교 전입니다.`); } catch (error) { setMessage("관측 JSON 형식을 확인하지 못했습니다. 오류 위치를 확인해 수정해 주세요."); setErrorDetails(error instanceof Error ? error.message : String(error)); } }}>관측 형식 확인</button><button type="button" className="btn-primary" disabled={busy || disabled || !validated || !files.length} onClick={() => void exportJob()}>{busy ? "묶음 만드는 중…" : "작업 묶음 내보내기"}</button></div>
    {busy && <button type="button" className="btn-secondary" onClick={() => controller.current?.abort()}>묶음 생성 중지</button>}
    <details><summary>Python 실행과 결과 가져오기</summary><p className="form-hint">고정 의존성이 설치된 Python 3.12 환경에서 저장소 루트를 열어 실행하세요. 출력 폴더는 실행마다 바꿔 주세요.</p><code style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{command}</code><button type="button" className="btn-secondary" onClick={() => { void navigator.clipboard.writeText(command).then(() => setMessage("명령을 복사했습니다."), () => setMessage("복사하지 못했습니다. 표시된 명령을 직접 선택해 주세요.")); }}>실행 명령 복사</button><p className="form-hint">결과 ZIP을 가져오면 원본과 후보를 비교할 수 있습니다. 원본이 기본이며 정리본은 직접 선택해야 합니다.</p></details>
    {message && <p role="status" className="form-hint">{message}</p>}
    {errorDetails && <details><summary>오류 상세</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{errorDetails}</pre></details>}
  </details>;
}
