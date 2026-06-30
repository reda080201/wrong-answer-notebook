import type { ReactNode } from "react";
import type { ExplanationPart, SheetAnswerItem, WrongAnswerEntry } from "../types";
import { LinkifiedText } from "../utils/wikiLinks";
import ContentBlock from "./ContentBlock";
import MathText from "./MathText";

interface SolutionBookViewProps {
  entry: WrongAnswerEntry;
  hideAnswers: boolean;
  onToggleHideAnswers: () => void;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
}

function difficultyLabel(value: SheetAnswerItem["difficulty"]) {
  if (value === "high") return "상";
  if (value === "medium") return "중";
  if (value === "low") return "하";
  return "-";
}

function explanationSteps(text: string): string[] {
  return text
    .split(/\n{2,}|\r?\n(?=\d+[.)]\s)|(?<=[.!?。])\s+(?=[가-힣A-Za-z0-9])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function SolutionRow({
  label,
  children,
  muted = false,
}: {
  label: string;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className={`solution-book-row ${muted ? "solution-book-row--muted" : ""}`}>
      <span className="solution-book-label">{label}</span>
      <div className="solution-book-content">{children}</div>
    </div>
  );
}

function SheetSolutionCard({
  item,
  hideAnswers,
  onWikiLinkClick,
  existingTargets,
}: {
  item: SheetAnswerItem;
  hideAnswers: boolean;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
}) {
  const steps = item.steps?.length ? item.steps : explanationSteps(item.explanation);
  const wrongPoints = item.wrongPoint?.trim() ? [item.wrongPoint.trim()] : item.importantPoints;
  return (
    <article className="solution-book-card">
      <header className="solution-book-card-head">
        <span>[해설 {item.questionNumber || "검토"}]</span>
        {item.needsReview && <small className="answer-review-badge">검토 필요</small>}
        {item.difficulty && item.difficulty !== "none" && (
          <small className={`difficulty-badge difficulty-badge--${item.difficulty}`}>
            난이도 {difficultyLabel(item.difficulty)}
          </small>
        )}
      </header>
      <SolutionRow label="정답">
        <strong className={hideAnswers ? "answer-hidden" : ""}>
          {hideAnswers ? "•••" : <MathText text={item.answer || "정답 없음"} />}
        </strong>
      </SolutionRow>
      <SolutionRow label="핵심 개념">
        {item.concepts?.length ? (
          <div className="solution-concepts">
            {item.concepts.map((concept) => (
              <button key={concept} type="button" onClick={() => onWikiLinkClick(concept)}>
                [[{concept}]]
              </button>
            ))}
          </div>
        ) : (
          <span className="solution-empty">-</span>
        )}
      </SolutionRow>
      <SolutionRow label="풀이 전략">
        <MathText text={item.strategy?.trim() || item.notes?.trim() || item.sourceNote?.trim() || "조건과 답안 연결을 확인합니다."} />
      </SolutionRow>
      <SolutionRow label="풀이 과정">
        {hideAnswers ? (
          <span className="answer-hidden">답 가리기 모드입니다.</span>
        ) : steps.length ? (
          <ol className="solution-steps">
            {steps.map((step, index) => (
              <li key={`${item.id}-step-${index}`}>
                <LinkifiedText text={step} onLinkClick={onWikiLinkClick} existingTargets={existingTargets} />
              </li>
            ))}
          </ol>
        ) : (
          <span className="solution-empty">풀이 없음</span>
        )}
      </SolutionRow>
      {(item.choiceJudgements?.length ?? 0) > 0 && (
        <SolutionRow label="보기별 판단">
          {hideAnswers ? (
            <span className="answer-hidden">답 가리기 모드입니다.</span>
          ) : (
            <ul className="solution-points solution-choice-judgements">
              {item.choiceJudgements?.map((judgement, index) => (
                <li key={`${item.id}-judgement-${index}`}>
                  {judgement.marker && <strong>{judgement.marker}</strong>}
                  <MathText text={judgement.text} />
                </li>
              ))}
            </ul>
          )}
        </SolutionRow>
      )}
      {wrongPoints.length > 0 && (
        <SolutionRow label="오답 포인트">
          <ul className="solution-points">
            {wrongPoints.map((point) => (
              <li key={point}>
                <MathText text={point} />
              </li>
            ))}
          </ul>
        </SolutionRow>
      )}
      <SolutionRow label="다음 복습" muted>
        <MathText text={item.needsReview ? "번호와 풀이 연결을 다시 확인하세요." : item.reviewPoint?.trim() || item.notes?.trim() || "같은 개념의 유사 문제로 확인하세요."} />
      </SolutionRow>
    </article>
  );
}

function WrongAnswerSolution({
  entry,
  onWikiLinkClick,
  existingTargets,
}: {
  entry: WrongAnswerEntry;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
}) {
  const parts = entry.explanationParts.filter((part) => part.text.trim() || part.images.length > 0);
  return (
    <div className="solution-book-card">
      <header className="solution-book-card-head">
        <span>[오답 해설]</span>
      </header>
      {entry.myAnswer.trim() && (
        <SolutionRow label="내 답">
          <LinkifiedText text={entry.myAnswer} onLinkClick={onWikiLinkClick} existingTargets={existingTargets} />
        </SolutionRow>
      )}
      {entry.correctAnswer.trim() && (
        <SolutionRow label="정답">
          <LinkifiedText text={entry.correctAnswer} onLinkClick={onWikiLinkClick} existingTargets={existingTargets} />
        </SolutionRow>
      )}
      {parts.length > 0 && (
        <SolutionRow label="풀이 과정">
          <div className="solution-explanation-parts">
            {parts.map((part: ExplanationPart, index) => (
              <section key={part.id}>
                <strong>해설 {index + 1}</strong>
                <ContentBlock
                  text={part.text}
                  images={part.images}
                  variant="fill"
                  onWikiLinkClick={onWikiLinkClick}
                  existingTargets={existingTargets}
                />
              </section>
            ))}
          </div>
        </SolutionRow>
      )}
      {entry.memo.trim() && (
        <SolutionRow label="다음 복습">
          <LinkifiedText text={entry.memo} onLinkClick={onWikiLinkClick} existingTargets={existingTargets} />
        </SolutionRow>
      )}
    </div>
  );
}

export default function SolutionBookView({
  entry,
  hideAnswers,
  onToggleHideAnswers,
  onWikiLinkClick,
  existingTargets,
}: SolutionBookViewProps) {
  const answerKey = (entry.answerKey ?? []).filter(
    (item) => item.questionNumber.trim() || item.answer.trim() || item.explanation.trim() || item.importantPoints.length,
  );

  return (
    <section className="solution-book">
      <header className="solution-book-cover">
        <div>
          <span className="study-paper-label">해설지</span>
          <h3>{entry.title.trim() || "해설"}</h3>
        </div>
        <button type="button" className={`btn-secondary btn-sm ${hideAnswers ? "active" : ""}`} onClick={onToggleHideAnswers}>
          {hideAnswers ? "정답 보이기" : "답 가리기"}
        </button>
      </header>
      {entry.entryKind === "problem_sheet" ? (
        answerKey.length ? (
          <div className="solution-book-list">
            {answerKey.map((item) => (
              <SheetSolutionCard
                key={item.id}
                item={item}
                hideAnswers={hideAnswers}
                onWikiLinkClick={onWikiLinkClick}
                existingTargets={existingTargets}
              />
            ))}
          </div>
        ) : (
          <div className="solution-empty-panel">연결된 답안지가 없습니다.</div>
        )
      ) : (
        <WrongAnswerSolution entry={entry} onWikiLinkClick={onWikiLinkClick} existingTargets={existingTargets} />
      )}
    </section>
  );
}
