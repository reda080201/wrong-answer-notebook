import type { ImportDetectedFormat } from "../utils/importStudyText";
import { getEntryImportReviewSummary } from "../utils/importAudit";
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
}

function ValidationIssues({ issues, label, limit = 6, className }: {
  issues: ImportValidationReport["issues"]; label: string; limit?: number; className?: string;
}) {
  const renderIssue = (issue: ImportValidationReport["issues"][number]) => <p key={issue.id} className={`import-validation-issue ${className ?? `import-validation-issue--${issue.severity}`}`}>{issue.message}</p>;
  return <div aria-label={`${label} 목록`}>
    <p className="form-hint">{label} · 안내 {issues.length}건</p>
    {issues.slice(0, limit).map(renderIssue)}
    {issues.length > limit && <details className="import-validation-more"><summary>나머지 {issues.length - limit}개 보기</summary>{issues.slice(limit).map(renderIssue)}</details>}
  </div>;
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
}: ImportPreviewSummaryProps) {
  const importReviewSummary = getEntryImportReviewSummary({ importAudit: validationReport?.audit, rejectedNotes });
  const hasBlockingIssues = validationPolicy.blocking.length > 0;
  const hasConfirmableIssues = validationPolicy.confirmable.length > 0;

  return (
    <>
      {validationReport?.audit && importReviewSummary.hasAuditIssue && (
        <div
          className={`import-audit-summary ${validationReport.issues.some((issue) => issue.severity === "error") ? "import-audit-summary--danger" : ""}`}
          role="alert"
        >
          <strong>
            가져오기 확인 요약
            {expectedQuestionNumbers.length > 0 && <span className="import-user-expected-badge">사용자 기준</span>}
          </strong>
          <span>
            예상 {validationReport.audit.expectedQuestionNumbers.length}문항 · 감지 {validationReport.audit.detectedQuestionNumbers.length}문항
          </span>
          {importReviewSummary.questionReviewCount > 0 && <p>검토 필요 문항 {importReviewSummary.questionReviewCount}개</p>}
          {importReviewSummary.legacyReviewCount > 0 && <p>검토 필요 항목 {importReviewSummary.legacyReviewCount}개 (세부 구분 정보 없음)</p>}
          {importReviewSummary.rejectedItemCount > 0 && <p>제외된 가져오기 항목 {importReviewSummary.rejectedItemCount}개</p>}
          {validationReport.audit.missingQuestionNumbers.length > 0 && (
            <p>누락 문항: {validationReport.audit.missingQuestionNumbers.join(", ")}</p>
          )}
          {validationReport.audit.uncertainQuestionNumbers.length > 0 && (
            <p>확인 필요 문항: {validationReport.audit.uncertainQuestionNumbers.join(", ")}</p>
          )}
          {validationReport.audit.handwritingExcluded === false && <p>손글씨 제외 여부가 확인되지 않았습니다.</p>}
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
        <div><dt>문항</dt><dd>{questionCount}문항</dd></div>
        <div><dt>이미지</dt><dd>{imageCount}개</dd></div>
        <div><dt>도표/그림</dt><dd>{figureCount}개</dd></div>
        <div><dt>답안 연결</dt><dd>{answerCount}개</dd></div>
        <div><dt>메모</dt><dd>{hasMemo ? "있음" : "없음"}</dd></div>
        <div><dt>검사 안내</dt><dd>{validationReport?.issues.length ? `${validationReport.issues.length}건 · 아래 내용 확인` : "파일·구조 검사에서 발견된 문제 없음"}</dd></div>
      </dl>

      {validationReport && validationReport.issues.length > 0 && (
        <details className="import-validation-report" open={reviewExpanded}>
          <summary>검토 이슈</summary>
          {hasBlockingIssues && (
            <div className="import-validation-section import-validation-section--blocking">
              <strong>적용 불가</strong>
              <p>누락 문제를 해결해야 적용할 수 있습니다. 본문/JSON을 수정하거나 다시 가져와 주세요.</p>
              {expectedQuestionNumbers.length > 0 && <p>사용자 입력 기준 누락이 감지되었습니다.</p>}
              <ValidationIssues issues={validationPolicy.blocking} label="적용 불가" className="import-validation-issue--error" />
            </div>
          )}
          {hasConfirmableIssues && (
            <div className="import-validation-section import-validation-section--confirmable">
              <strong>검토 권장</strong>
              <ValidationIssues issues={validationPolicy.confirmable} label="검토 권장" className="import-validation-issue--error" />
            </div>
          )}
          {validationPolicy.other.length > 0 && <ValidationIssues issues={validationPolicy.other} label="기타 검토" limit={8} />}
        </details>
      )}
    </>
  );
}
