import type { GeneratedExam } from "../../../types";
import { formatQuestionSourceLabel } from "../services/questionSource";
import EmptyState from "../../../shared/ui/EmptyState";

interface Props { exams: GeneratedExam[]; onOpen: (exam: GeneratedExam) => void; onDelete: (id: string) => void | Promise<void>; onPrint?: (exam: GeneratedExam) => void; disabled?: boolean; }
export default function GeneratedExamList({ exams, onOpen, onDelete, onPrint, disabled = false }: Props) {
  return (
    <section className="generated-exam-list" aria-label="내 모의고사">
      <header><div><p className="modal-eyebrow">내 모의고사</p><h2>저장한 문제 세트</h2></div><span>{exams.length}개</span></header>
      {exams.length ? (
        <div>{[...exams].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((exam) => (
          <article key={exam.id}>
            <div><strong>{exam.title}</strong><p>{exam.questions.length}문항 · {exam.preset} · {new Date(exam.createdAt).toLocaleDateString("ko-KR")}</p><small>평균 선택 점수 {exam.questions.length ? Math.round(exam.questions.reduce((sum, question) => sum + question.selectionScore, 0) / exam.questions.length) : 0}</small><div className="generated-exam-source-list">{exam.questions.slice(0, 3).map((question) => <small key={question.position}>{question.position}번 · {formatQuestionSourceLabel(question.source)}</small>)}</div></div>
            <div><button type="button" onClick={() => onOpen(exam)} disabled={disabled}>{exam.status === "ready" ? "풀기" : "검토"}</button>{onPrint && <button type="button" className="btn-secondary" onClick={() => onPrint(exam)} disabled={disabled}>PDF 만들기</button>}<button type="button" className="btn-secondary" onClick={() => onDelete(exam.id)} disabled={disabled}>삭제</button></div>
          </article>
        ))}</div>
      ) : <EmptyState className="list-empty">아직 만든 모의고사가 없습니다.</EmptyState>}
    </section>
  );
}
