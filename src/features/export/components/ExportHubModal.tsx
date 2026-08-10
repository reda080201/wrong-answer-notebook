import { useMemo, useState } from "react";
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
    onStartSolutionRoundtrip,
    selectionOnly = false,
  } = props;
  const [view, setView] = useState<ExportHubView>(initialView);
  const [scope, setScope] = useState<ExportScopeMode>(initialScope ?? (selectedQuestionNumbers.length ? "selected" : "current"));
  const [manualRange, setManualRange] = useState(selectedQuestionNumbers.join(", "));
  const scopeResult = useMemo(() => resolveExportQuestionNumbers({ entry, scope, selectedNumbers: selectedQuestionNumbers, currentQuestionNumber, manualInput: manualRange, examSession }), [entry, scope, selectedQuestionNumbers, currentQuestionNumber, manualRange, examSession]);
  const printModel = useMemo(() => buildExamPrintModel({ entry, questionNumbers: scopeResult.questionNumbers, preferences: examPrintPreferences, preset: examPrintPreferences.preset, scope }), [entry, scopeResult.questionNumbers, examPrintPreferences, scope]);

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

