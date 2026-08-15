import MathText from "../../../components/MathText";
import { normalizeLegacyMathCommandsForDisplay } from "../../../utils/legacyMathCommands";
import { PROBLEM_SOURCE_LABELS } from "../../../utils/problemSource";
import type { QuestionBankItem } from "../model/questionBankTypes";

interface QuestionBankCardProps {
  item: QuestionBankItem;
  onOpen: (item: QuestionBankItem) => void;
  onInspect: (item: QuestionBankItem) => void;
}

export default function QuestionBankCard({ item, onOpen, onInspect }: QuestionBankCardProps) {
  const { classification } = item;
  const statuses = [
    item.isWrong ? "오답" : null,
    item.reviewDue ? "복습 예정" : null,
    item.hasAnswer ? "정답 있음" : null,
    item.hasExplanation ? "해설 있음" : null,
  ].filter((value): value is string => Boolean(value)).slice(0, 2);
  return <article className="question-bank-card">
    <button type="button" className="question-bank-card__main" onClick={() => onOpen(item)} aria-label={`${item.entryTitle} ${item.questionNumber}번 열기`}>
      <header><strong>{item.entryTitle} {item.questionNumber}번</strong><span>{PROBLEM_SOURCE_LABELS[item.source.type]}</span></header>
      <div className="question-bank-card__chips"><span>{item.subject}</span>{classification.unit && <span>{classification.unit}</span>}{classification.subunit && <span>{classification.subunit}</span>}</div>
      <p><MathText text={normalizeLegacyMathCommandsForDisplay(item.questionText)} /></p>
      <footer>
        {statuses.map((status) => <span key={status} className={status === "오답" || status === "복습 예정" ? "question-bank-card__warning" : undefined}>{status}</span>)}
      </footer>
    </button>
    <button type="button" className="question-bank-card__detail" onClick={() => onInspect(item)}>상세</button>
  </article>;
}
