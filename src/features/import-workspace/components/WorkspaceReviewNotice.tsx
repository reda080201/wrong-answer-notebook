import { isAnswerReadyForGrading } from "../../../utils/studyAssessment";
import type { SheetAnswerItem } from "../../../types";
import type { ImportQuestionDraft, ImportWorkspaceWarning } from "../model/importWorkspace";

interface Props {
  question: ImportQuestionDraft;
  issues: ImportWorkspaceWarning[];
  disabled: boolean;
  onConfirm(): void;
}

export default function WorkspaceReviewNotice({ question, issues, disabled, onConfirm }: Props) {
  const referenceErrors = issues.some(issue => issue.severity === "error");
  const unconfirmedAnswer = Boolean(question.answer && !isAnswerReadyForGrading(question.answer as SheetAnswerItem));
  const unreviewedFigures = question.figures.some(figure => figure.needsReview || figure.processingStatus === "rejected");
  const blocked = referenceErrors || unconfirmedAnswer || unreviewedFigures;
  const needsReview = question.status !== "ready" || issues.length > 0 || blocked;

  return <section className="workspace-review-reasons" aria-label="문항 검토 안내">
    {needsReview ? <>
      <strong>{question.displayQuestionNumber}번 검토할 내용</strong>
      {issues.length > 0 && <ul>{issues.map(issue => <li key={issue.id}>{issue.severity === "error" ? "수정 필요: " : "확인 권장: "}{issue.message}</li>)}</ul>}
      {question.status !== "ready" && !question.warnings.length && <p>가져온 파일에서 검토를 요청했습니다. 구체적인 사유는 제공되지 않았습니다. 원본과 문항 내용을 비교해 주세요.</p>}
      {referenceErrors && <p className="form-hint">내용 편집에서 문항·파일 참조 오류를 수정하세요. 수정할 때 다시 검사합니다.</p>}
      {unconfirmedAnswer && <p className="form-hint">예상 답과 원문 답을 확인하세요. 정답을 확인하기 전에는 검토를 완료할 수 없습니다.</p>}
      {unreviewedFigures && <p className="form-hint">내용 편집의 그림 비교에서 원본과 정리본을 확인하세요. 실패한 그림은 원본을 보존한 채 수정해야 합니다.</p>}
      {question.status !== "ready" && <button type="button" className="btn-secondary" disabled={disabled || blocked} onClick={onConfirm}>내용 비교 확인 완료</button>}
    </> : <p role="status">추가 확인 없음</p>}
  </section>;
}
