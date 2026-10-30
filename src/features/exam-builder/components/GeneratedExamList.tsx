import MathText from "../../../components/MathText";
import type { GeneratedExam } from "../../../types";
import type { ExamOpenOptions } from "../../../hooks/useExamSessionController";
import { formatQuestionSourceLabel } from "../services/questionSource";
import EmptyState from "../../../shared/ui/EmptyState";

interface Props {
  exams: GeneratedExam[];
  onCreate?: () => void;
  onOpen: (exam: GeneratedExam, options?: ExamOpenOptions) => void;
  onDelete: (id: string) => void | Promise<void>;
  onPrint?: (exam: GeneratedExam) => void;
  onConfirmAnswer?: (exam: GeneratedExam, position: number) => void;
  protectedExamIds?: ReadonlySet<string>;
  protectionUnavailable?: boolean;
  disabled?: boolean;
}
export default function GeneratedExamList({ exams, onCreate, onOpen, onDelete, onPrint, onConfirmAnswer, protectedExamIds, protectionUnavailable = false, disabled = false }: Props) {
  return (
    <section className="generated-exam-list" aria-label="내 모의고사">
      <header><div><h2>내 모의고사</h2></div><span>{exams.length}개</span></header>
      {exams.length ? (
        <div>{[...exams].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((exam) => (
          <article key={exam.id}>
            <div><strong>{exam.title}</strong><p>{exam.questions.length}문항 · {({ real_exam: "실전형 모의고사", hard: "어려운 문제 집중", important: "중요한 문제 집중", quality: "좋은 문제 모음", weakness: "약점 집중", wrong_retry: "오답 재시험", random: "랜덤 복습", custom: "사용자 지정" })[exam.preset]} · {new Date(exam.createdAt).toLocaleDateString("ko-KR")}</p><details><summary>선정 기준 보기</summary><p>후보 선정에 사용한 내부 점수이며 성적이나 문항 난이도가 아닙니다.</p><small>평균 선택 점수 {exam.questions.length ? Math.round(exam.questions.reduce((sum, question) => sum + question.selectionScore, 0) / exam.questions.length) : 0}</small></details><div className="generated-exam-source-list">{exam.questions.slice(0, 3).map((question) => <small key={question.position}>{question.position}번 · {formatQuestionSourceLabel(question.source)}</small>)}</div>
              {(() => {
                const unresolved = exam.questions.filter(question => ["gpt_estimate", "conflict"].includes(question.snapshot.solutionAnswer?.answerProvenance?.kind ?? ""));
                if (!unresolved.length) return null;
                const protectedSnapshot = protectionUnavailable || protectedExamIds?.has(`generated:${exam.id}`) || exam.questions.some(question => protectedExamIds?.has(question.source.sourceEntryId));
                return <section className="generated-exam-answer-review" aria-label={`${exam.title} 미확인 정답`}>
                  <details><summary>확인이 필요한 정답 {unresolved.length}개 검토</summary>
                  {protectedSnapshot ? <p role="status">진행 중 실전 시험 자료는 제출 후 확인할 수 있습니다.</p> : unresolved.map(question => {
                    const answer = question.snapshot.solutionAnswer!;
                    return <div key={question.position} className="generated-exam-answer-review__item">
                      <strong>{question.position}번 문항 · 원본 {question.snapshot.questionNumber}번</strong>
                      {answer.sourceNote && <p>{answer.sourceNote}</p>}
                      <p>AI 예상 답: <MathText text={answer.answerProvenance?.proposedAnswer || "정보 없음"} /></p>
                      <p>현재 정답: <MathText text={answer.answer || "입력되지 않음"} /></p>
                      <button type="button" className="btn-secondary" disabled={disabled || !answer.answer?.trim() || !onConfirmAnswer} onClick={() => onConfirmAnswer?.(exam, question.position)}>이 정답 확인</button>
                    </div>;
                  })}</details>
                </section>;
              })()}
            </div>
            <div>
              <button type="button" onClick={() => onOpen(exam)} disabled={disabled}>{exam.status === "ready" ? exam.preset === "real_exam" ? "실전 모드" : "문제 풀기" : "검토"}</button>
              {exam.status === "ready" && exam.preset === "real_exam" && <button type="button" className="btn-secondary" onClick={() => onOpen(exam, { mode: "practice" })} disabled={disabled}>문제 풀기</button>}
              {exam.status === "ready" && exam.preset !== "real_exam" && <button type="button" className="btn-secondary" onClick={() => onOpen(exam, { mode: "real", timeLimitMinutes: exam.timeLimitMinutes ?? 50, showTimer: true, answerSheetOpen: true })} disabled={disabled}>실전 모드</button>}
              {onPrint && <button type="button" className="btn-secondary" onClick={() => onPrint(exam)} disabled={disabled}>PDF 만들기</button>}
              <button type="button" className="btn-secondary" onClick={() => onDelete(exam.id)} disabled={disabled}>삭제</button>
            </div>
          </article>
        ))}</div>
      ) : <EmptyState className="list-empty" action={onCreate && <button type="button" className="btn-primary" disabled={disabled} onClick={onCreate}>모의고사 만들기</button>}>아직 만든 모의고사가 없습니다.</EmptyState>}
    </section>
  );
}
