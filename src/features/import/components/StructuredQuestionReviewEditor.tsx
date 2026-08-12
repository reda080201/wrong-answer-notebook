import { useMemo } from "react";
import MathText from "../../../components/MathText";
import type { QuestionContentSegment, StructuredQuestion } from "../../../types";
import {
  materializeStructuredReviewSegments,
  projectStructuredSemanticFields,
  updateStructuredQuestionSegment,
} from "../services/structuredQuestionSegments";

function cloneSegment(segment: QuestionContentSegment): QuestionContentSegment {
  return segment.type === "table"
    ? { ...segment, rows: segment.rows.map((row) => [...row]) }
    : { ...segment };
}

function materialize(question: StructuredQuestion): QuestionContentSegment[] {
  return materializeStructuredReviewSegments(question).map(cloneSegment);
}

function projectQuestion(question: StructuredQuestion): StructuredQuestion {
  const contentSegments = materialize(question);
  return { ...question, ...projectStructuredSemanticFields(contentSegments), contentSegments };
}

function updateSegment(questions: StructuredQuestion[], patch: {
  questionNumber: string;
  segmentId: string;
  value: string;
}): StructuredQuestion[] {
  return updateStructuredQuestionSegment(questions, patch).map(projectQuestion);
}

export interface StructuredQuestionReviewEditorProps {
  id?: string;
  questions: StructuredQuestion[];
  onChange(questions: StructuredQuestion[]): void;
  disabled?: boolean;
}

function segmentLabel(segment: QuestionContentSegment, index: number): string {
  if (segment.type === "text") return index === 0 ? "본문" : `본문 ${index + 1}`;
  if (segment.type === "condition") return `조건 ${index + 1}`;
  if (segment.type === "equation") return `수식 ${index + 1}`;
  if (segment.type === "figure") return "그림 배치";
  return "표 배치";
}

export default function StructuredQuestionReviewEditor({
  id = "structured-question-review",
  questions,
  onChange,
  disabled = false,
}: StructuredQuestionReviewEditorProps) {
  const renderedQuestions = useMemo(
    () => questions.map((question) => ({ question, segments: materialize(question) })),
    [questions],
  );

  return (
    <section id={id} className="structured-question-review-editor" aria-label="구조화 문항 검수">
      <div className="structured-question-review-intro">
        <strong>문항별 구조화 검수</strong>
        <span>본문·조건·수식은 원래 순서대로 편집하고 그림과 표 배치는 유지됩니다.</span>
      </div>
      <div className="structured-question-review-list">
        {renderedQuestions.map(({ question, segments }, questionIndex) => {
          let semanticIndex = 0;
          return (
            <article
              id={`${id}-question-${questionIndex}`}
              key={question.questionNumber}
              className="structured-question-review-card"
              data-question-number={question.questionNumber}
            >
              <header className="structured-question-review-card-header">
                <h3>{question.questionNumber}번</h3>
                {question.needsReview && <span className="answer-review-badge">검토 필요</span>}
              </header>
              <div className="structured-question-review-segments">
                {segments.map((segment) => {
                  const segmentIndex = semanticIndex;
                  if (segment.type === "text" || segment.type === "condition" || segment.type === "equation") {
                    semanticIndex += 1;
                    const value = segment.type === "equation" ? segment.latex : segment.text;
                    const label = segmentLabel(segment, segmentIndex);
                    const fieldId = `${id}-${question.questionNumber}-${segment.id}`;
                    return (
                      <div key={segment.id} className="structured-question-review-field">
                        <label htmlFor={fieldId}>{label}</label>
                        <div className="structured-question-review-field-grid">
                          <textarea
                            id={fieldId}
                            aria-label={`${question.questionNumber}번 ${label}`}
                            value={value}
                            disabled={disabled}
                            onChange={(event) => onChange(updateSegment(questions, {
                              questionNumber: question.questionNumber,
                              segmentId: segment.id,
                              value: event.target.value,
                            }))}
                          />
                          <div className="structured-question-review-preview" aria-label={`${question.questionNumber}번 ${label} 미리보기`}>
                            <MathText text={value} />
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={segment.id} className="structured-question-review-anchor" aria-label={`${question.questionNumber}번 ${segment.type === "figure" ? "그림" : "표"} 배치`}>
                      <span>{segment.type === "figure" ? "그림 배치" : "표 배치"}</span>
                      <code>{segment.id}</code>
                      {segment.type === "figure" && <small>연결된 그림: {segment.figureId}</small>}
                      {segment.type === "table" && <small>{segment.rows.length}행 표</small>}
                    </div>
                  );
                })}
              </div>
              <fieldset className="structured-question-review-choices" disabled={disabled}>
                <legend>{question.questionNumber}번 선택지</legend>
                {question.choices.length > 0 ? question.choices.map((choice, choiceIndex) => (
                  <label key={`${question.questionNumber}-choice-${choiceIndex}`}>
                    <span>선택지 {choiceIndex + 1}</span>
                    <textarea
                      aria-label={`${question.questionNumber}번 선택지 ${choiceIndex + 1}`}
                      value={choice}
                      onChange={(event) => onChange(questions.map((item) =>
                        item.questionNumber === question.questionNumber
                          ? { ...item, choices: item.choices.map((value, index) => index === choiceIndex ? event.target.value : value) }
                          : item,
                      ))}
                    />
                  </label>
                )) : <p className="structured-question-review-empty">연결된 선택지가 없습니다.</p>}
              </fieldset>
            </article>
          );
        })}
      </div>
    </section>
  );
}
