import Dialog from "../../../shared/ui/Dialog";
import { difficultyScoreLabel } from "../../../utils/difficulty";
import { PROBLEM_SOURCE_LABELS } from "../../../utils/problemSource";
import type { QuestionBankItem } from "../model/questionBankTypes";

interface QuestionBankDetailProps {
  item: QuestionBankItem | null;
  onClose: () => void;
  onOpenQuestion: (item: QuestionBankItem) => void;
}

export default function QuestionBankDetail({ item, onClose, onOpenQuestion }: QuestionBankDetailProps) {
  return <Dialog open={Boolean(item)} onClose={onClose} title={item ? `${item.entryTitle} ${item.questionNumber}번` : "문항 상세"} ariaLabel="문제 은행 문항 상세">
    {item && <div className="question-bank-detail">
      <div className="question-bank-card__chips"><span>{PROBLEM_SOURCE_LABELS[item.source.type]}</span><span>{item.subject}</span>{item.classification.unit && <span>{item.classification.unit}</span>}{item.classification.subunit && <span>{item.classification.subunit}</span>}</div>
      <pre className="question-bank-detail__question">{item.questionText}</pre>
      <dl><div><dt>난이도</dt><dd>{difficultyScoreLabel(item.classification.difficultyScore)}</dd></div><div><dt>중요도</dt><dd>{item.classification.importanceScore ? `${Math.ceil(item.classification.importanceScore / 20)}/5` : "미지정"}</dd></div><div><dt>품질</dt><dd>{item.classification.qualityScore ?? "미지정"}</dd></div><div><dt>답 유형</dt><dd>{item.classification.answerType === "multiple_choice" ? "객관식" : item.classification.answerType === "short_answer" ? "단답형" : item.classification.answerType === "essay" ? "서술형" : "미분류"}</dd></div></dl>
      <section><h4>정답</h4><p>{item.answer ?? "연결되지 않음"}</p></section>
      <section><h4>해설</h4><p>{item.explanation ?? "연결되지 않음"}</p></section>
      <footer className="dialog-actions"><button type="button" className="btn-secondary" onClick={onClose}>닫기</button><button type="button" onClick={() => { onOpenQuestion(item); onClose(); }}>문제 열기</button></footer>
    </div>}
  </Dialog>;
}
