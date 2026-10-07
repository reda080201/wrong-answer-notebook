import type { SheetAnswerItem, SheetFigureItem } from "../../types";
import QuestionContentView from "../../components/QuestionContentView";
import MathText from "../../components/MathText";

export default function SolutionContent({ answer, figures = [], showAnswer = true }: { answer: SheetAnswerItem; figures?: SheetFigureItem[]; showAnswer?: boolean }) {
  const content = (text: string) => <QuestionContentView text={text} figures={figures} appendUnreferencedFigures={false} />;
  return <div className="solution-content">
    {showAnswer && <section><h3>정답</h3><MathText text={answer.answer || "정답 정보 없음"} /></section>}
    {answer.intent?.trim() && <section><h3>출제 의도</h3>{content(answer.intent)}</section>}
    {answer.strategy?.trim() && <section><h3>풀이 전략</h3>{content(answer.strategy)}</section>}
    {answer.explanation?.trim() && <section><h3>해설</h3>{content(answer.explanation)}</section>}
    {Boolean(answer.steps?.length) && <section><h3>단계별 풀이</h3><ol>{answer.steps?.map((step, index) => <li key={index}>{content(step)}</li>)}</ol></section>}
    {Boolean(answer.choiceJudgements?.length) && <section><h3>보기별 판단</h3>{answer.choiceJudgements?.map((item, index) => <div key={index}><strong>{item.marker}</strong>{content(item.text)}</div>)}</section>}
    {answer.wrongPoint?.trim() && <section><h3>오답 포인트</h3>{content(answer.wrongPoint)}</section>}
    {answer.reviewPoint?.trim() && <section><h3>복습 포인트</h3>{content(answer.reviewPoint)}</section>}
    {Boolean(answer.importantPoints?.length) && <section><h3>중요 사항</h3>{answer.importantPoints.map((point, index) => <div key={index}>{content(point)}</div>)}</section>}
    {!answer.explanation?.trim() && !answer.steps?.length && <p role="status">연결된 해설이 없습니다. 이 문항의 해설 자료를 가져와 연결해 주세요.</p>}
  </div>;
}
