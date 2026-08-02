import type { ImportDetectedFormat } from "../utils/importStudyText";
import type {
  ImportValidationClassification,
  ImportValidationReport,
} from "../utils/importValidation";

interface ImportPreviewSummaryProps {
  title?: string;
  detectedFormat?: ImportDetectedFormat;
  questionCount: number;
  imageCount: number;
  figureCount: number;
  answerCount: number;
  hasMemo: boolean;
  rejectedNotes: string[];
  expectedQuestionNumbers: string[];
  validationReport: ImportValidationReport | null;
  validationPolicy: ImportValidationClassification;
  reviewExpanded: boolean;
  confirmedWarnings: boolean;
  onConfirmedWarningsChange: (confirmed: boolean) => void;
}

export default function ImportPreviewSummary({
  title,
  detectedFormat,
  questionCount,
  imageCount,
  figureCount,
  answerCount,
  hasMemo,
  rejectedNotes,
  expectedQuestionNumbers,
  validationReport,
  validationPolicy,
  reviewExpanded,
  confirmedWarnings,
  onConfirmedWarningsChange,
}: ImportPreviewSummaryProps) {
  const hasBlockingIssues = validationPolicy.blocking.length > 0;
  const hasConfirmableIssues = validationPolicy.confirmable.length > 0;

  return (
    <>
      {validationReport?.audit && (
        <div
          className={`import-audit-summary ${validationReport.issues.some((issue) => issue.severity === "error") ? "import-audit-summary--danger" : ""}`}
          role="alert"
        >
          <strong>
            AI 판독 감사
            {expectedQuestionNumbers.length > 0 && <span className="import-user-expected-badge">사용자 기준</span>}
          </strong>
          <span>
            예상 {validationReport.audit.expectedQuestionNumbers.length} · 감지 {validationReport.audit.detectedQuestionNumbers.length} · 검토 {validationReport.audit.needsReviewCount}
          </span>
          {validationReport.audit.missingQuestionNumbers.length > 0 && (
            <p>누락 문제: {validationReport.audit.missingQuestionNumbers.join(", ")}</p>
          )}
          {validationReport.audit.uncertainQuestionNumbers.length > 0 && (
            <p>불확실 문제: {validationReport.audit.uncertainQuestionNumbers.join(", ")}</p>
          )}
          {!validationReport.audit.handwritingExcluded && <p>손글씨 제외 여부가 확인되지 않았습니다.</p>}
          {rejectedNotes.length > 0 && (
            <div className="import-rejected-notes">
              <b>학습 데이터에서 제외된 학생 필기</b>
              <p>자동 제거는 같은 문구 중심으로만 보장됩니다. 문제 본문, 메모, 답안지에 학생 필기가 남았는지 직접 확인하세요.</p>
              <ul>{rejectedNotes.map((note) => <li key={note}>{note}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {detectedFormat && detectedFormat !== "json" && (
        <div className="import-format-warning" role="alert">
          JSON이 아닌 텍스트로 감지되었습니다. GPT 프롬프트를 다시 복사해 순수 JSON 객체로 받아오면 답안지와 난이도 연결이 더 정확합니다.
        </div>
      )}

      <dl className="import-preview-meta">
        <div><dt>형식</dt><dd>{detectedFormat === "json" ? "JSON" : "텍스트"}</dd></div>
        <div><dt>제목</dt><dd>{title || "(제목 없음)"}</dd></div>
        <div><dt>문제 수</dt><dd>{questionCount}개</dd></div>
        <div><dt>이미지</dt><dd>{imageCount}개</dd></div>
        <div><dt>도표/그림</dt><dd>{figureCount}개</dd></div>
        <div><dt>답안 연결</dt><dd>{answerCount}개</dd></div>
        <div><dt>메모</dt><dd>{hasMemo ? "있음" : "없음"}</dd></div>
        <div><dt>검증</dt><dd>{validationReport?.issues.length ? `${validationReport.issues.length}개 확인` : "문제 없음"}</dd></div>
      </dl>

      {validationReport && validationReport.issues.length > 0 && (
        <details className="import-validation-report" open={reviewExpanded}>
          <summary>검토 이슈</summary>
          {hasBlockingIssues && (
            <div className="import-validation-section import-validation-section--blocking">
              <strong>적용 불가</strong>
              <p>누락 문제를 해결해야 적용할 수 있습니다. 본문/JSON을 수정하거나 다시 가져와 주세요.</p>
              {expectedQuestionNumbers.length > 0 && <p>사용자 입력 기준 누락이 감지되었습니다.</p>}
              {validationPolicy.blocking.slice(0, 6).map((issue) => (
                <p key={issue.id} className="import-validation-issue import-validation-issue--error">{issue.message}</p>
              ))}
            </div>
          )}
          {hasConfirmableIssues && (
            <div className="import-validation-section import-validation-section--confirmable">
              <strong>확인 후 적용 가능</strong>
              {validationPolicy.confirmable.slice(0, 6).map((issue) => (
                <p key={issue.id} className="import-validation-issue import-validation-issue--error">{issue.message}</p>
              ))}
            </div>
          )}
          {validationPolicy.other.slice(0, 8).map((issue) => (
            <p key={issue.id} className={`import-validation-issue import-validation-issue--${issue.severity}`}>{issue.message}</p>
          ))}
        </details>
      )}

      {!hasBlockingIssues && hasConfirmableIssues && (
        <label className="settings-checkbox import-danger-confirm">
          <input
            type="checkbox"
            checked={confirmedWarnings}
            onChange={(event) => onConfirmedWarningsChange(event.target.checked)}
          />
          손글씨/도표 연결 위험 항목을 확인했습니다.
        </label>
      )}
    </>
  );
}
