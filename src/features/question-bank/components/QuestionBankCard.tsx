import { difficultyScoreLabel } from "../../../utils/difficulty";
import { PROBLEM_SOURCE_LABELS } from "../../../utils/problemSource";
import type { QuestionBankItem } from "../model/questionBankTypes";

interface QuestionBankCardProps {
  item: QuestionBankItem;
  onOpen: (item: QuestionBankItem) => void;
  onInspect: (item: QuestionBankItem) => void;
}

export default function QuestionBankCard({ item, onOpen, onInspect }: QuestionBankCardProps) {
  const { classification } = item;
  return <article className="question-bank-card">
    <button type="button" className="question-bank-card__main" onClick={() => onOpen(item)} aria-label={`${item.entryTitle} ${item.questionNumber}번 열기`}>
      <header><strong>{item.entryTitle} {item.questionNumber}번</strong><span>{PROBLEM_SOURCE_LABELS[item.source.type]}</span></header>
      <div className="question-bank-card__chips"><span>{item.subject}</span>{classification.unit && <span>{classification.unit}</span>}{classification.subunit && <span>{classification.subunit}</span>}{(classification.concepts ?? []).slice(0, 2).map((concept) => <span key={concept}>{concept}</span>)}</div>
      <p>{item.questionText}</p>
      <footer>
        <span>{difficultyScoreLabel(classification.difficultyScore)}</span>
        <span>중요도 {classification.importanceScore ? `${Math.ceil(classification.importanceScore / 20)}/5` : "미지정"}</span>
        <span>{item.hasAnswer ? "정답 있음" : "정답 없음"}</span>
        <span>{item.hasExplanation ? "해설 있음" : "해설 없음"}</span>
        {item.isWrong && <span className="question-bank-card__warning">오답</span>}
        {item.reviewDue && <span className="question-bank-card__warning">복습 예정</span>}
        {item.hasImages && <span>이미지 {item.questionImages.length + item.sourcePageImages.length}</span>}
      </footer>
    </button>
    <button type="button" className="question-bank-card__detail" onClick={() => onInspect(item)}>상세</button>
  </article>;
}
