import MathText from "../../../components/MathText";
import { normalizeLegacyMathCommandsForDisplay } from "../../../utils/legacyMathCommands";
import { PROBLEM_SOURCE_LABELS } from "../../../utils/problemSource";
import type { QuestionBankItem } from "../model/questionBankTypes";

interface QuestionBankCardProps {
  item: QuestionBankItem;
  onOpen: (item: QuestionBankItem) => void;
  onInspect: (item: QuestionBankItem) => void;
  selected?: boolean;
}

export default function QuestionBankCard({ item, onOpen, onInspect, selected = false }: QuestionBankCardProps) {
  const { classification } = item;
  const statuses = [
    item.isWrong ? "오답" : null,
    item.reviewDue ? "복습 예정" : null,
    item.hasAnswer ? "정답 있음" : null,
    item.hasExplanation ? "해설 있음" : null,
  ].filter((value): value is string => Boolean(value)).slice(0, 2);
  return <article className={`question-bank-card${selected ? " is-selected" : ""}`} aria-label={`${item.entryTitle} ${item.questionNumber}번`} aria-current={selected ? "true" : undefined}>
    <button type="button" className="question-bank-card__main" onClick={() => onInspect(item)} aria-label={`${item.entryTitle} ${item.questionNumber}번 검사기 선택`}>
      <header><strong><span className="question-bank-card__number">{item.questionNumber}번</span>{item.entryTitle}</strong><span>{PROBLEM_SOURCE_LABELS[item.source.type]}</span></header>
      <div className="question-bank-card__meta"><span>{item.subject}</span>{classification.unit && <span>{classification.unit}</span>}{classification.subunit && <span>{classification.subunit}</span>}</div>
      <p><MathText text={normalizeLegacyMathCommandsForDisplay(item.questionText)} /></p>
      <footer>
        {statuses.map((status) => <span key={status} className={status === "오답" || status === "복습 예정" ? "question-bank-card__warning" : undefined}>{status}</span>)}
      </footer>
    </button>
    <button type="button" className="question-bank-card__detail" onClick={() => onOpen(item)} aria-label={`${item.entryTitle} ${item.questionNumber}번 문제 열기`}>문제 열기</button>
  </article>;
}
