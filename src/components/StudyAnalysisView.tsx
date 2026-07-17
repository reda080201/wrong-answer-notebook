import type { WrongAnswerEntry } from "../types";
import {
  PRACTICE_MODE_LABELS,
  mistakeCauseLabel,
  recommendedStrategyForAnalysis,
} from "../utils/mistakeAnalysis";
import MathText from "./MathText";

function formatMaybeDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function StudyAnalysisView({ entry }: { entry: WrongAnswerEntry }) {
  const strategy = recommendedStrategyForAnalysis(entry.mistakeAnalysis);
  const reviewHistory = entry.review?.history ?? [];
  const questionAttempts = (entry.reviewAttempts ?? []).filter((attempt) => attempt.questionNumber);
  const confidenceLabel = (value?: string) => value === "high" ? "높음" : value === "medium" ? "보통" : value === "low" ? "낮음" : "-";

  return (
    <section className="study-analysis">
      <header className="study-analysis-cover">
        <span className="study-paper-label">분석</span>
        <h3>{entry.title.trim() || "학습 분석"}</h3>
      </header>

      <div className="study-analysis-grid">
        <article className="study-analysis-card">
          <h4>AI 가져오기 검토</h4>
          {entry.importAudit ? (
            <dl className="study-analysis-stats">
              <div>
                <dt>예상</dt>
                <dd>{entry.importAudit.expectedQuestionNumbers.length}</dd>
              </div>
              <div>
                <dt>감지</dt>
                <dd>{entry.importAudit.detectedQuestionNumbers.length}</dd>
              </div>
              <div>
                <dt>누락</dt>
                <dd>{entry.importAudit.missingQuestionNumbers.length}</dd>
              </div>
              <div>
                <dt>검토</dt>
                <dd>{entry.importAudit.needsReviewCount}</dd>
              </div>
            </dl>
          ) : (
            <p className="study-analysis-empty">가져오기 감사 정보가 없습니다.</p>
          )}
          {entry.importAudit?.missingQuestionNumbers.length ? (
            <p className="study-analysis-danger">누락 문제: {entry.importAudit.missingQuestionNumbers.join(", ")}</p>
          ) : null}
          {entry.importAudit?.uncertainQuestionNumbers.length ? (
            <p>불확실 문제: {entry.importAudit.uncertainQuestionNumbers.join(", ")}</p>
          ) : null}
          {entry.importAudit && !entry.importAudit.handwritingExcluded && (
            <p className="study-analysis-danger">손글씨 제외 여부가 확인되지 않았습니다.</p>
          )}
        </article>

        <article className="study-analysis-card">
          <h4>제외된 학생 필기</h4>
          {(entry.rejectedNotes?.length ?? 0) > 0 ? (
            <ul className="study-analysis-list">
              {entry.rejectedNotes?.map((note) => (
                <li key={note}>
                  <MathText text={note} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="study-analysis-empty">제외된 학생 필기가 없습니다.</p>
          )}
        </article>

        <article className="study-analysis-card study-analysis-card--wide">
          <h4>오답 원인</h4>
          {(entry.mistakeAnalysis?.causes.length ?? 0) > 0 ? (
            <div className="study-cause-list">
              {entry.mistakeAnalysis?.causes.map((cause) => (
                <div key={cause.type} className={`study-cause study-cause--${cause.severity}`}>
                  <strong>{mistakeCauseLabel(cause.type)}</strong>
                  <span>{cause.severity === "high" ? "높음" : cause.severity === "low" ? "낮음" : "보통"}</span>
                  {cause.note && <p>{cause.note}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="study-analysis-empty">오답 원인이 아직 분류되지 않았습니다.</p>
          )}
          {entry.mistakeAnalysis?.preventionNote && (
            <div className="study-analysis-note">
              <strong>예방 메모</strong>
              <p>{entry.mistakeAnalysis.preventionNote}</p>
            </div>
          )}
          {entry.mistakeAnalysis?.confidence && (
            <p className="study-analysis-confidence">분석 신뢰도: {confidenceLabel(entry.mistakeAnalysis.confidence)}</p>
          )}
          {strategy && <p className="study-analysis-strategy">추천 복습: {PRACTICE_MODE_LABELS[strategy]}</p>}
        </article>

        {entry.entryKind === "problem_sheet" && questionAttempts.length > 0 && (
          <article className="study-analysis-card study-analysis-card--wide">
            <h4>문항별 복습 기록</h4>
            <div className="study-question-attempt-list">
              {Array.from(new Set(questionAttempts.map((attempt) => attempt.questionNumber))).map((questionNumber) => {
                const attempts = questionAttempts.filter((attempt) => attempt.questionNumber === questionNumber);
                const latest = attempts[attempts.length - 1];
                return (
                  <div key={questionNumber} className="study-question-attempt">
                    <strong>문제 {questionNumber}</strong>
                    <span>{attempts.length}회 복습</span>
                    <span>최근: {latest.result === "again" ? "다시" : latest.result === "hard" ? "어려움" : "맞음"}</span>
                    <span>신뢰도: {confidenceLabel(latest.confidence)}</span>
                  </div>
                );
              })}
            </div>
          </article>
        )}

        <article className="study-analysis-card study-analysis-card--wide">
          <h4>복습 상태</h4>
          <dl className="study-analysis-stats">
            <div>
              <dt>다음 복습</dt>
              <dd>{formatMaybeDate(entry.review?.dueAt)}</dd>
            </div>
            <div>
              <dt>간격</dt>
              <dd>{entry.review?.intervalDays ?? 0}일</dd>
            </div>
            <div>
              <dt>연속 성공</dt>
              <dd>{entry.review?.streak ?? 0}</dd>
            </div>
            <div>
              <dt>기억 안정도</dt>
              <dd>{entry.review?.stabilityDays ? `${Math.round(entry.review.stabilityDays)}일` : "-"}</dd>
            </div>
            <div>
              <dt>반복 실패</dt>
              <dd>{entry.review?.lapseCount ?? 0}회</dd>
            </div>
            <div>
              <dt>복습 단계</dt>
              <dd>{entry.review?.phase === "archived" ? "보관" : entry.review?.phase === "long_term" ? "장기 점검" : entry.review?.phase === "relearning" ? "재학습" : "학습 중"}</dd>
            </div>
            <div>
              <dt>완료</dt>
              <dd>{entry.mastered ? "완료" : "진행 중"}</dd>
            </div>
          </dl>
          {reviewHistory.length > 0 && (
            <ol className="study-review-history">
              {reviewHistory.slice(-5).reverse().map((event) => (
                <li key={event.id}>
                  <span>{formatMaybeDate(event.reviewedAt)}</span>
                  <strong>{event.result === "again" ? "다시" : event.result === "hard" ? "어려움" : "맞음"}</strong>
                  <small>{event.intervalDays}일 후</small>
                </li>
              ))}
            </ol>
          )}
        </article>
      </div>
    </section>
  );
}
