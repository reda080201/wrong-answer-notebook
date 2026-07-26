import type { ExamPrintPreferences, ExamPrintPreset, ExportScopeMode } from "../../../types";
import type { ResolveExportQuestionNumbersResult } from "../services/resolveExportQuestionNumbers";

const PRESETS: Array<{ id: ExamPrintPreset; label: string; description: string }> = [
  { id: "real_exam", label: "실전 재풀이", description: "정답/해설/기존 답 제외, 답안지 포함" },
  { id: "spacious", label: "여유 있게 풀기", description: "1단 우선, 풀이 공간 확대" },
  { id: "wrong_only", label: "오답만 다시 풀기", description: "틀린 문항만 깨끗한 시험지" },
  { id: "source_like", label: "원본에 가깝게", description: "구조화된 원문 순서 유지" },
  { id: "custom", label: "사용자 설정", description: "세부 옵션을 직접 지정" },
];

const SCOPES: Array<{ id: ExportScopeMode; label: string }> = [
  { id: "current", label: "현재 문항" },
  { id: "selected", label: "선택한 문항" },
  { id: "wrong", label: "틀린 문항" },
  { id: "important", label: "중요 표시 문항" },
  { id: "marked", label: "검토 표시 문항" },
  { id: "whole", label: "시험지 전체" },
  { id: "manual", label: "번호 직접 입력" },
];

interface ExamPdfOptionsProps {
  preferences: ExamPrintPreferences;
  scope: ExportScopeMode;
  manualRange: string;
  scopeResult: ResolveExportQuestionNumbersResult;
  onPreferencesChange: (patch: Partial<ExamPrintPreferences>) => void;
  onScopeChange: (scope: ExportScopeMode) => void;
  onManualRangeChange: (value: string) => void;
  onPreview: () => void;
  onBack: () => void;
}

export default function ExamPdfOptions(props: ExamPdfOptionsProps) {
  const { preferences, scope, manualRange, scopeResult, onPreferencesChange, onScopeChange, onManualRangeChange, onPreview, onBack } = props;
  return (
    <div className="export-exam-pdf-options">
      <header className="export-panel-header">
        <div>
          <h3>다시 풀기용 시험지 만들기</h3>
          <p>종이에 출력하거나 PDF로 저장해 다시 풀기 위한 시험지를 만듭니다. 기존 답과 해설은 기본적으로 제외됩니다.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={onBack}>뒤로</button>
      </header>
      <section>
        <h4>프리셋</h4>
        <div className="export-preset-grid">
          {PRESETS.map((preset) => (
            <button key={preset.id} type="button" className={`btn-secondary${preferences.preset === preset.id ? " active" : ""}`} onClick={() => onPreferencesChange({ preset: preset.id })}>
              <strong>{preset.label}</strong>
              <span>{preset.description}</span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h4>범위</h4>
        <div className="export-scope-row">
          {SCOPES.map((item) => (
            <label key={item.id}><input type="radio" name="exam-print-scope" checked={scope === item.id} onChange={() => onScopeChange(item.id)} /> {item.label}</label>
          ))}
        </div>
        {scope === "manual" ? <input className="input" value={manualRange} onChange={(event) => onManualRangeChange(event.target.value)} placeholder="예: 1-5, 8, 10-14" /> : null}
        {scopeResult.disabledReason ? <p className="form-error">{scopeResult.disabledReason}</p> : null}
        {scopeResult.invalidNumbers?.length ? <p className="form-error">없는 번호: {scopeResult.invalidNumbers.join(", ")}</p> : null}
        <p className="muted">선택 문항 {scopeResult.questionNumbers.length}개</p>
      </section>
      <details>
        <summary>세부 설정</summary>
        <div className="export-detail-grid">
          <label>용지<select value={preferences.paperSize} onChange={(event) => onPreferencesChange({ paperSize: event.target.value as ExamPrintPreferences["paperSize"] })}><option value="a4">A4</option><option value="letter">Letter</option></select></label>
          <label>방향<select value={preferences.orientation} onChange={(event) => onPreferencesChange({ orientation: event.target.value as ExamPrintPreferences["orientation"] })}><option value="portrait">세로</option><option value="landscape">가로</option><option value="auto">자동</option></select></label>
          <label>배치<select value={preferences.layout} onChange={(event) => onPreferencesChange({ layout: event.target.value as ExamPrintPreferences["layout"] })}><option value="auto">자동</option><option value="single">1단</option><option value="columns">2단</option></select></label>
          <label>풀이 공간<select value={preferences.workspaceSize} onChange={(event) => onPreferencesChange({ workspaceSize: event.target.value as ExamPrintPreferences["workspaceSize"] })}><option value="none">없음</option><option value="small">작게</option><option value="normal">보통</option><option value="large">넓게</option></select></label>
          <label><input type="checkbox" checked={preferences.includeHeader} onChange={(event) => onPreferencesChange({ includeHeader: event.target.checked })} /> 시험 헤더</label>
          <label><input type="checkbox" checked={preferences.includeAnswerSheet} onChange={(event) => onPreferencesChange({ includeAnswerSheet: event.target.checked })} /> 빈 답안지</label>
          <label><input type="checkbox" checked={preferences.includePageNumbers} onChange={(event) => onPreferencesChange({ includePageNumbers: event.target.checked })} /> 페이지 번호</label>
          <label><input type="checkbox" checked={preferences.includeSourcePages} onChange={(event) => onPreferencesChange({ includeSourcePages: event.target.checked })} /> 원본 페이지 이미지</label>
          <label>연습장 페이지<input type="number" min={0} max={3} value={preferences.extraScratchPages} onChange={(event) => onPreferencesChange({ extraScratchPages: Number(event.target.value) || 0 })} /></label>
        </div>
      </details>
      <footer className="export-panel-footer">
        <button type="button" className="btn-primary" onClick={onPreview} disabled={!scopeResult.questionNumbers.length || Boolean(scopeResult.disabledReason)}>미리보기</button>
      </footer>
    </div>
  );
}

