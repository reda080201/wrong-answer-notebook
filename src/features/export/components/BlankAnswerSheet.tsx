import type { ExamPrintQuestionModel } from "../types";

interface BlankAnswerSheetProps {
  questions: ExamPrintQuestionModel[];
}

export default function BlankAnswerSheet({ questions }: BlankAnswerSheetProps) {
  return (
    <section className="exam-print-answer-sheet">
      <h2>답안지</h2>
      <p>정답이 미리 표시되지 않은 빈 작성란입니다.</p>
      {questions.map((question) => (
        <div key={question.questionNumber} className="exam-print-answer-row">
          <strong>{question.displayNumber}.</strong>
          {question.kind === "objective" ? (
            <div className="exam-print-bubbles">
              {["①", "②", "③", "④", "⑤"].map((mark) => <span key={mark}>{mark}</span>)}
            </div>
          ) : (
            <span className="exam-print-blank" />
          )}
        </div>
      ))}
    </section>
  );
}

