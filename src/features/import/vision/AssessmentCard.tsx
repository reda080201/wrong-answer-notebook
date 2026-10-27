import { useState } from "react";
import type { QuestionMeta, SheetAnswerItem } from "../../../types";
import MathText from "../../../components/MathText";
import { confirmAssessmentAnswer, isAnswerReadyForGrading } from "../../../utils/studyAssessment";

export default function AssessmentCard({ meta, answer, disabled, onMetaChange, onAnswerChange }: {
  meta: QuestionMeta; answer?: SheetAnswerItem; disabled?: boolean;
  onMetaChange?(meta: QuestionMeta): void; onAnswerChange?(answer: SheetAnswerItem): void;
}) {
  const a = meta.studyAssessment;
  const [difficulty, setDifficulty] = useState(String(meta.difficultyScore ?? ""));
  const [importance, setImportance] = useState(String(meta.rating?.importanceScore ?? ""));
  const [error, setError] = useState("");
  const [answerDraft, setAnswerDraft] = useState(answer?.answer ?? "");
  if (!a) return null;
  const statuses = { solved: "풀이 완료", partially_solved: "부분 풀이", unsolved: "풀이 미완료", unreadable: "판독 불가" };
  return <section className="assessment-card" aria-label={`${meta.questionNumber}번 사전 평가`}>
    <header><strong>{meta.questionNumber}번 · {statuses[a.assessmentStatus]}</strong><span>{meta.rating?.evaluationSource === "gpt" ? "GPT 실행 확인" : meta.rating?.evaluationSource === "manual" ? "사용자 평가" : "외부 분석 · 실행 미확인"}</span></header>
    <p>난이도 <strong>{meta.difficultyScore === undefined ? "미평가" : `${meta.difficultyScore}/100`}</strong> · 중요도 <strong>{meta.rating?.importanceScore === undefined ? "미평가" : `${meta.rating.importanceScore}/100`}</strong></p>
    <p>AI 예상 답: <MathText text={a.solution.proposedAnswer ?? "없음"} />{a.sourceAnswer.value && <> · 원문 답: <MathText text={a.sourceAnswer.value} /></>}</p>
    {answer && !isAnswerReadyForGrading(answer) && <div role="note"><p>{answer.sourceNote ?? "정답 확인 전 자동 채점에서 제외됩니다."}</p>{onAnswerChange && <><label>확인할 정답<input aria-label="확인할 정답" value={answerDraft} disabled={disabled} onChange={event => setAnswerDraft(event.target.value)} /></label><button type="button" className="btn-secondary" disabled={disabled || !answerDraft.trim()} onClick={() => onAnswerChange(confirmAssessmentAnswer({ ...answer, answer: answerDraft }))}>이 정답 확인</button></>}</div>}
    <details><summary>풀이·평가 근거 보기</summary><MathText text={a.solution.summary} /><p>{a.solution.strategy}</p><ol>{a.solution.steps.map((step,index) => <li key={index}><MathText text={step} /></li>)}</ol><p>검산 요약: {a.solution.selfCheck}</p><p>난이도 신뢰도 {a.scores.difficulty.confidence}/100 · {a.scores.difficulty.reasons.join(" · ")}</p><p>중요도 신뢰도 {a.scores.importance.confidence}/100 · {a.scores.importance.reasons.join(" · ")}</p><p>개념: {a.classification.concepts.join(" · ") || "미분류"}</p>{a.warnings.length > 0 && <ul>{a.warnings.map((warning,index) => <li key={index}>{warning}</li>)}</ul>}</details>
    {onMetaChange && <details><summary>점수 직접 수정</summary><label>난이도 (1~100, 빈칸은 미평가)<input type="number" min={1} max={100} step={1} value={difficulty} disabled={disabled} onChange={event => setDifficulty(event.target.value)} /></label><label>중요도 (1~100, 빈칸은 미평가)<input type="number" min={1} max={100} step={1} value={importance} disabled={disabled} onChange={event => setImportance(event.target.value)} /></label><button type="button" className="btn-secondary" disabled={disabled} onClick={() => {
      const valid = (value: string) => value === "" || Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100;
      if (!valid(difficulty) || !valid(importance)) { setError("점수는 1~100 정수 또는 빈칸으로 입력하세요."); return; }
      setError(""); onMetaChange({ ...meta, difficultyScore: difficulty ? Number(difficulty) : undefined, rating: { ...meta.rating, importanceScore: importance ? Number(importance) : undefined, evaluationSource: "manual", lastEvaluatedAt: new Date().toISOString() }, classification: { ...meta.classification, difficultySource: "manual" } });
    }}>수동 점수 적용</button>{error && <p role="alert" className="form-error">{error}</p>}</details>}
  </section>;
}
