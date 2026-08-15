import MathText from "../../../components/MathText";
import { normalizeLegacyMathCommandsForDisplay } from "../../../utils/legacyMathCommands";
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
      <span className="question-bank-card__number">{item.questionNumber}</span>
      <span className="question-bank-card__content"><strong>{item.entryTitle}{item.duplicateQuestionNumber ? " · 번호 중복 검수 필요" : ""}</strong><p><MathText text={normalizeLegacyMathCommandsForDisplay(item.questionText)} /></p><small>{item.subject} · {classification.unit || "단원 미분류"}{classification.subunit ? ` · ${classification.subunit}` : ""}</small></span>
      {statuses[0] && <span className={`question-bank-card__status ${statuses[0] === "오답" || statuses[0] === "복습 예정" ? "question-bank-card__warning" : ""}`}>{statuses[0]}</span>}
    </button>
    <button type="button" className="question-bank-card__detail" aria-label={`${item.entryTitle} ${item.questionNumber}번 검사`} onClick={() => onInspect(item)}>ⓘ</button>
  </article>;
}
