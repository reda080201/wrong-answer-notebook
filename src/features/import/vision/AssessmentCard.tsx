import { applyAssessmentScores } from "./assessmentUpdates";
import { useState } from "react";
import type { QuestionMeta, SheetAnswerItem } from "../../../types";
import MathText from "../../../components/MathText";
import { confirmAssessmentAnswer, isAnswerReadyForGrading } from "../../../utils/studyAssessment";

export default function AssessmentCard({ meta, answer, disabled, onMetaChange, onAnswerChange }: {
  meta: QuestionMeta; answer?: SheetAnswerItem; disabled?: boolean;
  onMetaChange?(meta: QuestionMeta): void; onAnswerChange?(answer: SheetAnswerItem): void;
}) {
  return <AssessmentCardFields key={meta.questionNumber} meta={meta} answer={answer} disabled={disabled} onMetaChange={onMetaChange} onAnswerChange={onAnswerChange} />;
}

function AssessmentCardFields({ meta, answer, disabled, onMetaChange, onAnswerChange }: {
  meta: QuestionMeta; answer?: SheetAnswerItem; disabled?: boolean;
  onMetaChange?(meta: QuestionMeta): void; onAnswerChange?(answer: SheetAnswerItem): void;
}) {
  const a = meta.studyAssessment;
  const [difficulty, setDifficulty] = useState(String(meta.difficultyScore ?? ""));
  const [importance, setImportance] = useState(String(meta.rating?.importanceScore ?? ""));
  const [answerDraft, setAnswerDraft] = useState(answer?.answer ?? "");
  const [dirty, setDirty] = useState({ difficulty: false, importance: false, answer: false });
  const [baseline, setBaseline] = useState({ difficulty: String(meta.difficultyScore ?? ""), importance: String(meta.rating?.importanceScore ?? ""), answer: answer?.answer ?? "" });
  const [applyDifficulty, setApplyDifficulty] = useState(false);
  const [applyImportance, setApplyImportance] = useState(false);
  const [error, setError] = useState("");
  const incoming = { difficulty: String(meta.difficultyScore ?? ""), importance: String(meta.rating?.importanceScore ?? ""), answer: answer?.answer ?? "" };
  const [previousIncoming, setPreviousIncoming] = useState({ values: incoming, dirty });
  if (previousIncoming.values.difficulty !== incoming.difficulty || previousIncoming.values.importance !== incoming.importance || previousIncoming.values.answer !== incoming.answer || previousIncoming.dirty.difficulty !== dirty.difficulty || previousIncoming.dirty.importance !== dirty.importance || previousIncoming.dirty.answer !== dirty.answer) {
    setPreviousIncoming({ values: incoming, dirty });
    setDifficulty(current => dirty.difficulty ? current : incoming.difficulty);
    setImportance(current => dirty.importance ? current : incoming.importance);
    setAnswerDraft(current => dirty.answer ? current : incoming.answer);
    setBaseline(current => ({ difficulty: dirty.difficulty ? current.difficulty : incoming.difficulty, importance: dirty.importance ? current.importance : incoming.importance, answer: dirty.answer ? current.answer : incoming.answer }));
  }
  if (!a) return null;
  const conflicts = { difficulty: dirty.difficulty && incoming.difficulty !== baseline.difficulty, importance: dirty.importance && incoming.importance !== baseline.importance, answer: dirty.answer && incoming.answer !== baseline.answer };
  const resolve = (field: keyof typeof dirty, useIncoming: boolean) => {
    const value = incoming[field];
    setBaseline(current => ({ ...current, [field]: value }));
    if (useIncoming) {
      if (field === "difficulty") setDifficulty(value);
      if (field === "importance") setImportance(value);
      if (field === "answer") setAnswerDraft(value);
      setDirty(current => ({ ...current, [field]: false }));
    }
  };
  const conflictControls = (field: keyof typeof dirty, label: string) => conflicts[field] && <div role="alert"><span>{label} 값이 외부에서 변경되었습니다.</span><button type="button" disabled={disabled} onClick={() => resolve(field, true)}>최신값 불러오기</button><button type="button" disabled={disabled} onClick={() => resolve(field, false)}>내 입력 적용</button></div>;
  const statuses = { solved: "풀이 완료", partially_solved: "부분 풀이", unsolved: "풀이 미완료", unreadable: "판독 불가" };
  return <section className="assessment-card" aria-label={`${meta.questionNumber}번 사전 평가`}>
    <header><strong>{meta.questionNumber}번 · {statuses[a.assessmentStatus]}</strong><span>{meta.assessmentEvidence ? "GPT 실행 확인" : meta.rating?.evaluationSource === "manual" ? "사용자 평가" : "외부 분석 · 실행 미확인"}</span></header>
    <p>난이도 <strong>{meta.difficultyScore === undefined ? "미평가" : `${meta.difficultyScore}/100`}</strong> · 중요도 <strong>{meta.rating?.importanceScore === undefined ? "미평가" : `${meta.rating.importanceScore}/100`}</strong></p>
    <p>AI 예상 답: <MathText text={a.solution.proposedAnswer ?? "없음"} />{a.sourceAnswer.value && <> · 원문 답: <MathText text={a.sourceAnswer.value} /></>}</p>
    {answer && !isAnswerReadyForGrading(answer) && <div role="note"><p>{answer.sourceNote ?? "정답 확인 전 자동 채점에서 제외됩니다."}</p>{onAnswerChange && <><label>확인할 정답<input aria-label="확인할 정답" value={answerDraft} disabled={disabled} onChange={event => { setAnswerDraft(event.target.value); setDirty(current => ({ ...current, answer: true })); }} /></label>{conflictControls("answer", "정답")}<button type="button" className="btn-secondary" disabled={disabled || !answerDraft.trim() || conflicts.answer} onClick={() => { onAnswerChange(confirmAssessmentAnswer({ ...answer, answer: answerDraft })); setDirty(current => ({ ...current, answer: false })); }}>이 정답 확인</button></>}</div>}
    <details><summary>풀이·평가 근거 보기</summary><MathText text={a.solution.summary} /><p>{a.solution.strategy}</p><ol>{a.solution.steps.map((step,index) => <li key={index}><MathText text={step} /></li>)}</ol><p>검산 요약: {a.solution.selfCheck}</p><p>난이도 신뢰도 {a.scores.difficulty.confidence}/100 · {a.scores.difficulty.reasons.join(" · ")}</p><p>중요도 신뢰도 {a.scores.importance.confidence}/100 · {a.scores.importance.reasons.join(" · ")}</p><p>개념: {a.classification.concepts.join(" · ") || "미분류"}</p>{a.warnings.length > 0 && <ul>{a.warnings.map((warning,index) => <li key={index}>{warning}</li>)}</ul>}</details>
    {onMetaChange && (meta.difficultyScore !== (a.scores.difficulty.value ?? undefined) || meta.rating?.importanceScore !== (a.scores.importance.value ?? undefined)) && <details><summary>보존된 AI 평가 적용</summary><p>AI 점수는 선택한 항목에만 적용됩니다. 중요 표시·품질·복습 기록은 유지됩니다.</p><label><input aria-label="AI 난이도 적용" type="checkbox" checked={applyDifficulty} onChange={event => setApplyDifficulty(event.target.checked)} disabled={disabled}/>난이도 {a.scores.difficulty.value ?? "미평가"}</label><label><input aria-label="AI 중요도 적용" type="checkbox" checked={applyImportance} onChange={event => setApplyImportance(event.target.checked)} disabled={disabled}/>중요도 {a.scores.importance.value ?? "미평가"}</label><button type="button" className="btn-secondary" disabled={disabled || !applyDifficulty && !applyImportance} onClick={() => { onMetaChange(applyAssessmentScores(meta, {difficulty:applyDifficulty,importance:applyImportance})); if (applyDifficulty) { setDifficulty(String(a.scores.difficulty.value ?? "")); setDirty(current => ({ ...current, difficulty: false })); } if (applyImportance) { setImportance(String(a.scores.importance.value ?? "")); setDirty(current => ({ ...current, importance: false })); } }}>선택한 점수 적용</button></details>}
    {onMetaChange && <details><summary>점수 직접 수정</summary><label>난이도 (1~100, 빈칸은 미평가)<input aria-label="수동 난이도" type="number" min={1} max={100} step={1} value={difficulty} disabled={disabled} onChange={event => { setDifficulty(event.target.value); setDirty(current => ({ ...current, difficulty: true })); }} /></label>{conflictControls("difficulty", "난이도")}<label>중요도 (1~100, 빈칸은 미평가)<input aria-label="수동 중요도" type="number" min={1} max={100} step={1} value={importance} disabled={disabled} onChange={event => { setImportance(event.target.value); setDirty(current => ({ ...current, importance: true })); }} /></label>{conflictControls("importance", "중요도")}<button type="button" className="btn-secondary" disabled={disabled || !dirty.difficulty && !dirty.importance || conflicts.difficulty || conflicts.importance} onClick={() => {
      const valid = (value: string) => value === "" || Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100;
      if (dirty.difficulty && !valid(difficulty) || dirty.importance && !valid(importance)) { setError("점수는 1~100 정수 또는 빈칸으로 입력하세요."); return; }
      setError(""); onMetaChange({ ...meta, ...(dirty.difficulty ? { difficultyScore: difficulty ? Number(difficulty) : undefined, classification: { ...meta.classification, difficultySource: "manual" } } : {}), ...(dirty.importance ? { rating: { ...meta.rating, importanceScore: importance ? Number(importance) : undefined, evaluationSource: "manual", lastEvaluatedAt: new Date().toISOString() } } : {}) }); setDirty({ difficulty: false, importance: false, answer: dirty.answer });
    }}>수동 점수 적용</button>{error && <p role="alert" className="form-error">{error}</p>}</details>}
  </section>;
}
