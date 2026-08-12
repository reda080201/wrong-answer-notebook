import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ClipboardCheck } from "lucide-react";
import FullscreenDialog from "../../../shared/ui/FullscreenDialog";
import type { StructuredQuestion } from "../../../types";
import { Badge, ScrollArea, Toolbar } from "../../../shared/ui";
import "./ImportReviewWorkspace.css";

export interface ImportReviewQuestionRenderProps {
  question: StructuredQuestion;
  index: number;
  questionCount: number;
}

export interface ImportReviewWorkspaceProps {
  open: boolean;
  title: ReactNode;
  onClose(): void;
  children?: ReactNode;
  summary?: ReactNode;
  status?: ReactNode;
  sidebar?: ReactNode;
  questionNavigator?: ReactNode;
  footer?: ReactNode;
  bodyLabel?: string;
  /** Canonical question data for the one-question review mode. */
  structuredQuestions?: StructuredQuestion[];
  activeQuestionIndex?: number;
  defaultActiveQuestionIndex?: number;
  onActiveQuestionChange?(index: number): void;
  /** Replaces the legacy children slot when structuredQuestions is supplied. */
  currentQuestionBody?: ReactNode | ((props: ImportReviewQuestionRenderProps) => ReactNode);
  renderQuestion?(props: ImportReviewQuestionRenderProps): ReactNode;
  /** Optional replacement for the generated left navigator. */
  navigator?: ReactNode;
  sourcePane?: ReactNode | ((props: ImportReviewQuestionRenderProps) => ReactNode);
  warnings?: ReactNode | ((props: ImportReviewQuestionRenderProps) => ReactNode);
}

function ReviewSidebar({ sidebar, questionNavigator }: Pick<ImportReviewWorkspaceProps, "sidebar" | "questionNavigator">) {
  if (!sidebar && !questionNavigator) return undefined;

  return (
    <div className="import-review-workspace-sidebar-content">
      {questionNavigator && <section aria-label="문항 탐색">{questionNavigator}</section>}
      {sidebar && <section aria-label="검수 도구">{sidebar}</section>}
    </div>
  );
}

export function ImportReviewWorkspace({
  open,
  title,
  onClose,
  children,
  summary,
  status,
  sidebar,
  questionNavigator,
  footer,
  bodyLabel = "가져오기 검수 본문",
  structuredQuestions,
  activeQuestionIndex,
  defaultActiveQuestionIndex = 0,
  onActiveQuestionChange,
  currentQuestionBody,
  renderQuestion,
  navigator,
  sourcePane,
  warnings,
}: ImportReviewWorkspaceProps) {
  const questionCount = structuredQuestions?.length ?? 0;
  const [uncontrolledIndex, setUncontrolledIndex] = useState(defaultActiveQuestionIndex);
  const requestedIndex = activeQuestionIndex ?? uncontrolledIndex;
  const currentIndex = questionCount
    ? Math.min(Math.max(requestedIndex, 0), questionCount - 1)
    : 0;
  const currentQuestion = structuredQuestions?.[currentIndex];
  const renderProps = currentQuestion
    ? { question: currentQuestion, index: currentIndex, questionCount }
    : undefined;

  useEffect(() => {
    if (questionCount && requestedIndex !== currentIndex && activeQuestionIndex === undefined) {
      setUncontrolledIndex(currentIndex);
    }
  }, [activeQuestionIndex, currentIndex, questionCount, requestedIndex]);

  const changeQuestion = (nextIndex: number) => {
    if (!questionCount) return;
    const next = Math.min(Math.max(nextIndex, 0), questionCount - 1);
    setUncontrolledIndex(next);
    onActiveQuestionChange?.(next);
  };

  const generatedNavigator = structuredQuestions?.length ? (
    <div className="import-review-question-nav">
      <strong id="import-review-question-nav-title">문항</strong>
      <div role="list" aria-labelledby="import-review-question-nav-title">
        {structuredQuestions.map((question, index) => (
          <button
            key={`${question.questionNumber}-${index}`}
            type="button"
            className={question.needsReview ? "is-review" : undefined}
            aria-current={index === currentIndex ? "page" : undefined}
            aria-label={`${question.questionNumber}번 문항${question.needsReview ? ", 검토 필요" : ""}`}
            onClick={() => changeQuestion(index)}
          >
            {question.questionNumber}
          </button>
        ))}
      </div>
    </div>
  ) : undefined;

  const resolvedNavigator = navigator ?? generatedNavigator ?? questionNavigator;
  const resolvedSidebar = sidebar || resolvedNavigator
      ? <ReviewSidebar sidebar={sidebar} questionNavigator={resolvedNavigator} />
    : undefined;

  const activeBody = renderProps
    ? typeof currentQuestionBody === "function"
      ? currentQuestionBody(renderProps)
      : renderQuestion
        ? renderQuestion(renderProps)
        : currentQuestionBody
    : children;
  const activeSource = renderProps
    ? typeof sourcePane === "function" ? sourcePane(renderProps) : sourcePane
    : undefined;
  const activeWarnings = renderProps
    ? typeof warnings === "function" ? warnings(renderProps) : warnings
    : undefined;
  const navigationFooter = structuredQuestions?.length ? (
    <div className="import-review-navigation-actions" aria-label="문항 이동">
      <button type="button" className="ui-button ui-button--secondary" disabled={currentIndex === 0} onClick={() => changeQuestion(currentIndex - 1)}>
        <ChevronLeft size={16} aria-hidden="true" /> 이전
      </button>
      <span aria-live="polite">{currentIndex + 1} / {questionCount}</span>
      <button type="button" className="ui-button ui-button--secondary" disabled={currentIndex === questionCount - 1} onClick={() => changeQuestion(currentIndex + 1)}>
        다음 <ChevronRight size={16} aria-hidden="true" />
      </button>
    </div>
  ) : undefined;

  return (
    <FullscreenDialog
      open={open}
      title={title}
      onClose={onClose}
      sidebar={resolvedSidebar}
      footer={structuredQuestions?.length ? <div className="import-review-footer-shell">{navigationFooter}{footer}</div> : footer}
    >
      <div className="import-review-workspace">
        {(summary || status) && (
          <section className="import-review-workspace-summary" aria-label="검수 요약">
            <Toolbar align="between" label="검수 상태">
              <div className="import-review-workspace-summary-copy">
                <ClipboardCheck size={18} aria-hidden="true" />
                <div>{summary}</div>
              </div>
              {status && (
                <div role="status" aria-live="polite">
                  <Badge tone="info">{status}</Badge>
                </div>
              )}
            </Toolbar>
          </section>
        )}
        {activeWarnings}
        <div className={activeSource ? "import-review-content-with-source" : undefined}>
          <ScrollArea className="import-review-workspace-body" aria-label={bodyLabel}>
            {renderProps && <h3 className="import-review-active-question-title">{renderProps.question.questionNumber}번 문항</h3>}
            {activeBody}
          </ScrollArea>
          {activeSource && <aside className="import-review-source-pane" aria-label="원본">{activeSource}</aside>}
        </div>
      </div>
    </FullscreenDialog>
  );
}

export default ImportReviewWorkspace;
