import { useEffect, useMemo, useState } from "react";
import type { ChatGptMcpPreferences, ExamPrintPreferences, ExamSession, ExportScopeMode, McpSendOptions, WrongAnswerEntry } from "../../../types";
import { downloadMarkdown } from "../../../utils/exportEntry";
import { buildGptExportPayload } from "../../../utils/gptExport";
import { buildExamPrintModel } from "../services/buildExamPrintModel";
import { resolveExportQuestionNumbers } from "../services/resolveExportQuestionNumbers";
import type { ExportHubView } from "../types";
import ChatGptSharePanel from "./ChatGptSharePanel";
import type { GptSolutionPurpose } from "./ChatGptSharePanel";
import ExamPdfOptions from "./ExamPdfOptions";
import ExamPrintPreview from "./ExamPrintPreview";
import { buildQuestionExportPackage, buildQuestionExportZip, downloadBlob, entryToQuestionExport } from "../services/questionExport";
import Dialog from "../../../shared/ui/Dialog";
import { buildQuestionRenderDescriptor, buildQuestionRenderFingerprint, DEFAULT_QUESTION_PNG_OPTIONS, downloadQuestionPng, QUESTION_PNG_RENDERER_VERSION, type QuestionPngOptions } from "../services/questionPng";
import QuestionRenderComparisonPanel from "./QuestionRenderComparisonPanel";
import { getEntryQuestions } from "../../../utils/entryQuestions";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";
import { getImageUrl } from "../../../api";

interface ExportHubModalProps {
  entry: WrongAnswerEntry;
  allEntries: WrongAnswerEntry[];
  examSession?: ExamSession | null;
  currentQuestionNumber?: string;
  selectedQuestionNumbers?: string[];
  examPrintPreferences: ExamPrintPreferences;
  onExamPrintPreferencesChange: (patch: Partial<ExamPrintPreferences>) => Promise<void> | void;
  chatGptPreferences: ChatGptMcpPreferences;
  onChatGptPreferencesChange: (patch: Partial<ChatGptMcpPreferences>) => Promise<void> | void;
  onSyncExportContext: (payload: { scope: ExportScopeMode; questionNumbers: string[]; submitted: boolean; shareOptions: McpSendOptions }) => Promise<void>;
  onCheckLocalMcp?: () => Promise<void>;
  remoteMcpConfigured?: boolean;
  onOpenSettings?: () => void;
  onClose: () => void;
  initialView?: ExportHubView;
  initialScope?: ExportScopeMode;
  onToast?: (message: string) => void;
  onPersistQuestionRender?: (input: { questionNumber: string; blob: Blob; filename: string; canonicalFingerprint: string; scope: QuestionPngOptions["scope"]; rendererVersion: string }) => Promise<void>;
  onUpdateQuestionRenderVerification?: (input: { questionNumber: string; scope: QuestionPngOptions["scope"]; rendererVersion: string; status: "unverified" | "needs_review" | "verified" }) => Promise<void>;
  onStartSolutionRoundtrip?: (input: {
    purpose: GptSolutionPurpose;
    questionNumbers: string[];
    payload: import("../types").ChatGptSharePayload;
  }) => Promise<void>;
  selectionOnly?: boolean;
}

export default function ExportHubModal(props: ExportHubModalProps) {
  const {
    entry,
    allEntries,
    examSession,
    currentQuestionNumber,
    selectedQuestionNumbers = [],
    examPrintPreferences,
    onExamPrintPreferencesChange,
    chatGptPreferences,
    onChatGptPreferencesChange,
    onSyncExportContext,
    onCheckLocalMcp,
    remoteMcpConfigured,
    onOpenSettings,
    onClose,
    initialView = "home",
    initialScope,
    onToast,
    onPersistQuestionRender,
    onUpdateQuestionRenderVerification,
    onStartSolutionRoundtrip,
    selectionOnly = false,
  } = props;
  const [view, setView] = useState<ExportHubView>(initialView);
  const [scope, setScope] = useState<ExportScopeMode>(initialScope ?? (selectedQuestionNumbers.length ? "selected" : "current"));
  const [manualRange, setManualRange] = useState(selectedQuestionNumbers.join(", "));
  const [pngOptions, setPngOptions] = useState<QuestionPngOptions>(DEFAULT_QUESTION_PNG_OPTIONS);
  const [pngPreviewUrl, setPngPreviewUrl] = useState<string | null>(null);
  const [pngBlob, setPngBlob] = useState<Blob | null>(null);
  const [pngError, setPngError] = useState<string | null>(null);
  const [pngBusy, setPngBusy] = useState(false);
  const [pngFingerprint, setPngFingerprint] = useState<string | null>(null);
  const scopeResult = useMemo(() => resolveExportQuestionNumbers({ entry, scope, selectedNumbers: selectedQuestionNumbers, currentQuestionNumber, manualInput: manualRange, examSession }), [entry, scope, selectedQuestionNumbers, currentQuestionNumber, manualRange, examSession]);
  const printModel = useMemo(() => buildExamPrintModel({ entry, questionNumbers: scopeResult.questionNumbers, preferences: examPrintPreferences, preset: examPrintPreferences.preset, scope }), [entry, scopeResult.questionNumbers, examPrintPreferences, scope]);
  const resolvedQuestionNumber = normalizeQuestionNumber(currentQuestionNumber ?? scopeResult.questionNumbers[0] ?? "");
  const resolvedQuestion = useMemo(() => getEntryQuestions(entry).find((item) => normalizeQuestionNumber(item.questionNumber) === resolvedQuestionNumber) ?? null, [entry, resolvedQuestionNumber]);
  const renderFigures = useMemo(() => (entry.figures ?? []).filter((figure) => resolvedQuestion?.figureIds.includes(figure.id) || normalizeQuestionNumber(figure.questionNumber) === resolvedQuestionNumber), [entry.figures, resolvedQuestion?.figureIds, resolvedQuestionNumber]);
  const currentRenderFingerprint = useMemo(() => {
    const answer = entry.answerKey?.find((item) => normalizeQuestionNumber(item.questionNumber) === resolvedQuestionNumber);
    return resolvedQuestion
      ? buildQuestionRenderFingerprint(buildQuestionRenderDescriptor({ question: resolvedQuestion, figures: renderFigures, answer: answer?.answer, explanation: answer?.explanation, scope: pngOptions.scope }))
      : buildQuestionRenderFingerprint({ rendererVersion: QUESTION_PNG_RENDERER_VERSION, scope: pngOptions.scope, questionNumber: resolvedQuestionNumber });
  }, [entry.answerKey, pngOptions.scope, renderFigures, resolvedQuestion, resolvedQuestionNumber]);

  const copyText = async (text: string, message: string) => {
    await navigator.clipboard.writeText(text);
    onToast?.(message);
  };

  const exportPlainText = async () => {
    const numbers = scopeResult.questionNumbers.length ? scopeResult.questionNumbers : [currentQuestionNumber ?? ""].filter(Boolean);
    const text = buildGptExportPayload({ entry, allEntries, currentQuestionNumber, rangeMode: numbers.length ? "manual-range" : "current", manualRange: numbers.join(","), format: "prompt", includeQuestion: true, includeChoices: true, includeFigures: true, includeAnswers: false, includeExplanations: false, includeWrongPoints: false, includeLearning: false });
    await copyText(text, "일반 텍스트를 복사했습니다.");
  };

  const exportJson = async () => {
    const numbers = scopeResult.questionNumbers.length ? scopeResult.questionNumbers : [currentQuestionNumber ?? ""].filter(Boolean);
    const text = buildGptExportPayload({ entry, allEntries, currentQuestionNumber, rangeMode: numbers.length ? "manual-range" : "current", manualRange: numbers.join(","), format: "json", includeQuestion: true, includeChoices: true, includeFigures: true, includeAnswers: false, includeExplanations: false, includeWrongPoints: false, includeLearning: false });
    await copyText(text, "JSON을 복사했습니다.");
  };
  const exportQuestions = async (format: "json" | "markdown" | "text") => {
    const numbers = scopeResult.questionNumbers.length ? scopeResult.questionNumbers : [currentQuestionNumber ?? ""].filter(Boolean);
    const questions = entryToQuestionExport(entry, numbers, false).questions;
    const pack = buildQuestionExportPackage({ title: entry.title, subject: entry.subject, questions, options: { includeSourceReferences: false } });
    const text = format === "json" ? JSON.stringify({ manifest: pack.manifest, questions: pack.questions }, null, 2) : format === "markdown" ? pack.markdown : pack.text;
    await copyText(text, "문항 추출본을 복사했습니다.");
  };
  const exportQuestionZip = async () => {
    const numbers = scopeResult.questionNumbers.length ? scopeResult.questionNumbers : [currentQuestionNumber ?? ""].filter(Boolean);
    const questions = entryToQuestionExport(entry, numbers, true).questions;
    const blob = await buildQuestionExportZip({ title: entry.title, subject: entry.subject, questions, options: { includeSourceReferences: true } });
    downloadBlob(blob, `${entry.title.replace(/[^a-zA-Z0-9가-힣_-]/g, "_")}_문항.zip`);
    onToast?.("문항 ZIP을 저장했습니다.");
  };
  useEffect(() => () => { if (pngPreviewUrl) URL.revokeObjectURL(pngPreviewUrl); }, [pngPreviewUrl]);
  const renderQuestionPng = async () => {
    const number = resolvedQuestionNumber;
    if (!number || !resolvedQuestion) { setPngError("현재 canonical 문항을 찾지 못했습니다."); return; }
    setPngBusy(true); setPngError(null);
    try {
      const answer = entry.answerKey?.find((item) => normalizeQuestionNumber(item.questionNumber) === number);
      const { renderCanonicalQuestionToPng } = await import("../services/questionPng");
      const blob = await renderCanonicalQuestionToPng({ question: resolvedQuestion, figures: renderFigures, answer: answer?.answer, explanation: answer?.explanation, resolveImageUrl: getImageUrl }, pngOptions);
      setPngBlob(blob);
      setPngFingerprint(currentRenderFingerprint);
      setPngPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(blob); });
    } catch (error) { setPngError(error instanceof Error ? error.message : "문항 PNG를 만들지 못했습니다."); } finally { setPngBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} className="modal-card export-hub-modal" ariaLabel="공유·내보내기" backdropClassName="modal-backdrop export-hub-backdrop">
        <header className="modal-header">
          <div>
            <p className="modal-eyebrow">공유·내보내기</p>
            <h2>무엇을 하시겠습니까?</h2>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="닫기">✕</button>
        </header>
        {view === "home" ? (
          <div className="export-hub-home">
            <button type="button" className="export-hub-card" onClick={() => setView("exam-pdf")} >
              <strong>다시 풀기용 시험지 만들기</strong>
              <p>문제를 시험지 형태로 자동 조판하여 인쇄하거나 PDF로 저장합니다.</p>
              <span>시험지 만들기</span>
            </button>
            <button type="button" className="export-hub-card" onClick={() => setView("chatgpt-share")} >
              <strong>ChatGPT로 문제 보내기</strong>
              <p>현재 문제 또는 선택한 문제를 MCP로 공유하고 ChatGPT에서 도움을 받습니다.</p>
              <span>ChatGPT/MCP 전달</span>
            </button>
            <button type="button" className="export-hub-card" onClick={() => setView("questions")}>
              <strong>문항만 추출</strong>
              <p>정답과 해설을 제외하고 문제 구조와 직접 연결 그림을 추출합니다.</p>
              <span>JSON · Markdown · 텍스트</span>
            </button>
            <button type="button" className="export-hub-card" onClick={() => setView("question-png")}>
              <strong>정리본 PNG 만들기</strong>
              <p>현재 canonical 문항 surface만 렌더해 미리보기와 다운로드를 제공합니다.</p>
              <span>PNG 미리보기 · 다운로드</span>
            </button>
            <details className="export-hub-misc">
              <summary>기타 내보내기</summary>
              <div className="export-hub-misc-actions">
                <button type="button" className="btn-secondary" onClick={() => void exportPlainText()}>일반 텍스트 복사</button>
                <button type="button" className="btn-secondary" onClick={() => { downloadMarkdown(entry); onToast?.("Markdown을 저장했습니다."); }}>Markdown 내보내기</button>
                <button type="button" className="btn-secondary" onClick={() => void exportJson()}>JSON 내보내기</button>
              </div>
            </details>
          </div>
        ) : null}
        {view === "questions" ? <div className="export-hub-misc-actions"><p>현재 범위의 문제 본문·선지·그림만 내보냅니다. 정답, 해설, 답안, 메모는 제외됩니다.</p><button type="button" className="btn-secondary" onClick={() => void exportQuestionZip()}>문항 ZIP 다운로드</button><button type="button" className="btn-secondary" onClick={() => void exportQuestions("json")}>JSON 복사</button><button type="button" className="btn-secondary" onClick={() => void exportQuestions("markdown")}>Markdown 복사</button><button type="button" className="btn-secondary" onClick={() => void exportQuestions("text")}>텍스트 복사</button><button type="button" className="btn-secondary" onClick={() => setView("home")}>뒤로</button></div> : null}
        {view === "question-png" ? <section className="export-question-png"><p>canonical 문항을 고정 조판 surface에서 다시 렌더합니다. 원본 crop과는 별도의 파생 이미지이며 다운로드는 entry를 변경하지 않습니다.</p><label>범위<select aria-label="PNG 포함 범위" value={pngOptions.scope} onChange={(event) => setPngOptions((current) => ({ ...current, scope: event.target.value as QuestionPngOptions["scope"] }))}><option value="question">문제만</option><option value="question_answer">문제 + 정답</option><option value="question_answer_explanation">문제 + 정답 + 해설</option></select></label><label>배경<select value={pngOptions.background} onChange={(event) => setPngOptions((current) => ({ ...current, background: event.target.value as QuestionPngOptions["background"] }))}><option value="white">흰색</option><option value="transparent">투명</option></select></label><label>배율<select value={pngOptions.scale} onChange={(event) => setPngOptions((current) => ({ ...current, scale: Number(event.target.value) as QuestionPngOptions["scale"] }))}>{([2, 3] as const).map((scale) => <option key={scale} value={scale}>{scale}x</option>)}</select></label><label>파일명<input value={pngOptions.filename} onChange={(event) => setPngOptions((current) => ({ ...current, filename: event.target.value }))} /></label><div className="dialog-actions"><button type="button" className="btn-primary" disabled={pngBusy} onClick={() => void renderQuestionPng()}>{pngBusy ? "렌더링 중..." : "미리보기 만들기"}</button><button type="button" className="btn-secondary" disabled={!pngBlob} onClick={() => pngBlob && downloadQuestionPng(pngBlob, pngOptions.filename)}>PNG 저장</button><button type="button" className="btn-secondary" disabled={!pngBlob || !pngFingerprint || !onPersistQuestionRender} onClick={() => { if (resolvedQuestionNumber && pngBlob && pngFingerprint && onPersistQuestionRender) void onPersistQuestionRender({ questionNumber: resolvedQuestionNumber, blob: pngBlob, filename: pngOptions.filename, canonicalFingerprint: pngFingerprint, scope: pngOptions.scope, rendererVersion: QUESTION_PNG_RENDERER_VERSION }); }}>정리본 보관</button><button type="button" className="btn-secondary" onClick={() => setView("home")}>뒤로</button></div>{pngError && <p className="form-error" role="alert">{pngError}</p>}{pngPreviewUrl && <img className="export-question-png__preview" src={pngPreviewUrl} alt="정리본 문항 PNG 미리보기" />}<QuestionRenderComparisonPanel entry={entry} questionNumber={resolvedQuestionNumber} scope={pngOptions.scope} rendererVersion={QUESTION_PNG_RENDERER_VERSION} currentFingerprint={currentRenderFingerprint} onVerificationChange={(status) => resolvedQuestionNumber && onUpdateQuestionRenderVerification ? onUpdateQuestionRenderVerification({ questionNumber: resolvedQuestionNumber, scope: pngOptions.scope, rendererVersion: QUESTION_PNG_RENDERER_VERSION, status }) : undefined} /></section> : null}
        {view === "exam-pdf" ? (
          <ExamPdfOptions
            preferences={examPrintPreferences}
            scope={scope}
            manualRange={manualRange}
            scopeResult={scopeResult}
            onPreferencesChange={(patch) => void onExamPrintPreferencesChange(patch)}
            onScopeChange={setScope}
            onManualRangeChange={setManualRange}
            onPreview={() => setView("exam-preview")}
            onBack={() => setView("home")}
          />
        ) : null}
        {view === "exam-preview" ? (
          <ExamPrintPreview model={printModel} onBack={() => setView("exam-pdf")} />
        ) : null}
        {view === "chatgpt-share" ? (
          <ChatGptSharePanel
            entry={entry}
            examSession={examSession}
            currentQuestionNumber={currentQuestionNumber}
            selectedQuestionNumbers={selectedQuestionNumbers}
            preferences={chatGptPreferences}
            onPreferencesChange={onChatGptPreferencesChange}
            onSyncExportContext={onSyncExportContext}
            onCheckLocalMcp={onCheckLocalMcp}
            remoteMcpConfigured={remoteMcpConfigured}
            onOpenSettings={onOpenSettings}
            onStartSolutionRoundtrip={onStartSolutionRoundtrip}
            onBack={() => setView("home")}
            initialScope={scope}
            selectionOnly={selectionOnly}
          />
        ) : null}
    </Dialog>
  );
}

