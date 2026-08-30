import MathText from "../../../components/MathText";
import { normalizeLegacyMathCommandsForDisplay } from "../../../utils/legacyMathCommands";
import { ExternalLink } from "lucide-react";
import type { QuestionBankItem } from "../model/questionBankTypes";

interface QuestionBankCardProps {
  item: QuestionBankItem;
  onOpen: (item: QuestionBankItem) => void;
  onInspect: (item: QuestionBankItem) => void;
  selected?: boolean;
}

export default function QuestionBankCard({ item, onOpen, onInspect, selected = false }: QuestionBankCardProps) {
  const statuses = [
    item.isWrong ? "오답" : null,
    item.reviewDue ? "복습 예정" : null,
    item.hasAnswer ? "정답 있음" : null,
    item.hasExplanation ? "해설 있음" : null,
  ].filter((value): value is string => Boolean(value)).slice(0, 2);
  return <article className={`question-bank-card${selected ? " is-selected" : ""}`} aria-label={`${item.entryTitle} ${item.questionNumber}번`} aria-current={selected ? "true" : undefined}>
    <button type="button" className="question-bank-card__main" onClick={() => onInspect(item)} aria-label={`${item.entryTitle} ${item.questionNumber}번 검사기 선택`}>
      <header><strong><span className="question-bank-card__number">{item.questionNumber}번</span>{item.entryTitle}</strong><span className={statuses[0] === "오답" || statuses[0] === "복습 예정" ? "question-bank-card__warning" : undefined}>{statuses[0] ?? "문항"}</span></header>
      <p><MathText text={normalizeLegacyMathCommandsForDisplay(item.questionText)} /></p>
    </button>
    <button type="button" className="question-bank-card__detail" onClick={() => onOpen(item)} aria-label={`${item.entryTitle} ${item.questionNumber}번 문제 열기`} title="문제 열기"><ExternalLink size={17} aria-hidden="true" /></button>
  </article>;
}
