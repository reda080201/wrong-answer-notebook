import type { Annotation, AnnotationTool, ReviewResult, SheetAnswerItem, SheetFigureItem } from "../types";
import type { PassageBlock, ParagraphBlock, QuestionBlock } from "../utils/textLayout";
import { LinkifiedText } from "../utils/wikiLinks";
import MathText from "./MathText";
import { FocusedQuestionView } from "./AnnotatableQuestion";

interface QuestionTheaterViewProps {
  passage?: PassageBlock | ParagraphBlock;
  questionBlock: QuestionBlock;
  questionIndex: number;
  questionCount: number;
  answer?: SheetAnswerItem;
  questionImages: string[];
  figures: SheetFigureItem[];
  annotations: Annotation[];
  memoMode: boolean;
  activeTool: AnnotationTool | "erase";
  hideAnswers: boolean;
  memo?: string;
  onAnnotationsChange: (annotations: Annotation[]) => void;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
  onPrevious: () => void;
  onNext: () => void;
  onToggleAnswers: () => void;
  onReview: (result: ReviewResult) => void;
  onClose: () => void;
}

export default function QuestionTheaterView({
  passage,
  questionBlock,
  questionIndex,
  questionCount,
  answer,
  questionImages,
  figures,
  annotations,
  memoMode,
  activeTool,
  hideAnswers,
  memo,
  onAnnotationsChange,
  onWikiLinkClick,
  existingTargets,
  onPrevious,
  onNext,
  onToggleAnswers,
  onReview,
  onClose,
}: QuestionTheaterViewProps) {
  return (
    <div className="question-theater" role="dialog" aria-modal="true" aria-label="문제 크게 보기">
      <div className="question-theater-shell">
        <header className="question-theater-toolbar">
          <button type="button" onClick={onPrevious} disabled={questionIndex <= 0}>
            이전
          </button>
          <strong>
            문제 {questionBlock.displayNumber}
            <span> / {questionCount}</span>
          </strong>
          <button type="button" onClick={onNext} disabled={questionIndex >= questionCount - 1}>
            다음
          </button>
          <button type="button" onClick={onClose}>
            작게 보기
          </button>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="극장 모드 나가기">
            나가기
          </button>
        </header>

        <FocusedQuestionView
          passage={passage}
          questionBlock={questionBlock}
          questionImages={questionImages}
          figures={figures}
          annotations={annotations}
          memoMode={memoMode}
          activeTool={activeTool}
          onAnnotationsChange={onAnnotationsChange}
          onWikiLinkClick={onWikiLinkClick}
          existingTargets={existingTargets}
          showImages
        />

        <section className="question-theater-panels">
          <article>
            <button type="button" className="btn-secondary" onClick={onToggleAnswers}>
              {hideAnswers ? "정답 보기" : "정답 가리기"}
            </button>
            {answer ? (
              <div className={hideAnswers ? "answer-hidden" : ""}>
                {hideAnswers ? (
                  <p>정답이 가려져 있습니다.</p>
                ) : (
                  <>
                    <h3>정답</h3>
                    <MathText text={answer.answer || "정답 없음"} />
                    {answer.explanation && (
                      <>
                        <h3>해설</h3>
                        <LinkifiedText
                          text={answer.explanation}
                          onLinkClick={onWikiLinkClick}
                          existingTargets={existingTargets}
                        />
                      </>
                    )}
                  </>
                )}
              </div>
            ) : (
              <p>연결된 답안지가 없습니다.</p>
            )}
          </article>
          <article>
            <h3>메모</h3>
            {answer?.notes || answer?.reviewPoint || answer?.wrongPoint || memo ? (
              <div className="memo-content">
                {[answer?.notes, answer?.wrongPoint, answer?.reviewPoint, memo].filter(Boolean).join("\n")}
              </div>
            ) : (
              <p>현재 문제에 표시할 메모가 없습니다.</p>
            )}
            <button type="button" className="btn-primary" onClick={() => onReview("good")}>
              맞음으로 기록
            </button>
          </article>
        </section>
      </div>
    </div>
  );
}
