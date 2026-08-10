import { useMemo, useState } from "react";
import type { GeneratedExam, GeneratedExamPreset, WrongAnswerEntry } from "../../../types";
import { defaultBlueprintForPreset } from "../model/examBlueprint";
import { generateExam, type ExamBuilderFilters } from "../services/generateExam";
import { formatQuestionSourceLabel, sourceStatusLabel } from "../services/questionSource";
import Dialog from "../../../shared/ui/Dialog";

const PRESETS: Array<{ id: GeneratedExamPreset; title: string; description: string }> = [
  { id: "real_exam", title: "실전형 모의고사", description: "여러 시험지에서 난이도 곡선과 출처 균형을 적용합니다." },
  { id: "hard", title: "어려운 문제 집중", description: "난이도와 품질이 높은 문항을 우선합니다." },
  { id: "important", title: "중요한 문제 집중", description: "중요 표시와 복습 신호를 반영합니다." },
  { id: "quality", title: "좋은 문제만 모으기", description: "검수 상태와 정답·해설 연결을 기준으로 선별합니다." },
  { id: "weakness", title: "약점 집중 세트", description: "반복 실패·복습 필요 문항을 우선합니다." },
  { id: "wrong_retry", title: "오답 재시험", description: "선택 범위의 오답만 새 시험으로 구성합니다." },
  { id: "random", title: "랜덤 복습", description: "seed 기반으로 재현 가능한 무작위 세트를 만듭니다." },
  { id: "custom", title: "사용자 지정", description: "범위와 조건을 직접 고릅니다." },
];

interface Props {
  entries: WrongAnswerEntry[];
  selectedEntryIds?: string[];
  onSave: (exam: GeneratedExam) => Promise<void> | void;
  onStart: (exam: GeneratedExam) => Promise<void> | void;
  onClose: () => void;
}

const seed = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export default function ExamBuilderWizard({ entries, selectedEntryIds = [], onSave, onStart, onClose }: Props) {
  const [step, setStep] = useState<"setup" | "review">("setup");
  const [preset, setPreset] = useState<GeneratedExamPreset>("real_exam");
  const [title, setTitle] = useState("새 모의고사");
  const [count, setCount] = useState(20);
  const [subject, setSubject] = useState("");
  const [filters, setFilters] = useState<ExamBuilderFilters>(() => selectedEntryIds.length ? { entryIds: selectedEntryIds } : {});
  const [generated, setGenerated] = useState<GeneratedExam | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const subjects = useMemo(() => [...new Set(entries.filter((entry) => entry.entryKind === "problem_sheet").map((entry) => entry.subject))], [entries]);
  const assemble = (nextSeed = seed(), locked = generated?.questions.filter((question) => question.locked)) => {
    const blueprint = defaultBlueprintForPreset(preset, count);
    const next = generateExam({ entries, title, preset, blueprint, seed: nextSeed, filters: { ...filters, subject: subject || undefined, wrongOnly: preset === "wrong_retry" || filters.wrongOnly, importantOnly: preset === "important" || filters.importantOnly }, lockedQuestions: locked });
    setGenerated(next); setStep("review");
  };
  const toggleLocked = (position: number) => setGenerated((current) => current && ({ ...current, questions: current.questions.map((question) => question.position === position ? { ...question, locked: !question.locked } : question) }));
  const exclude = (position: number) => setGenerated((current) => current && ({ ...current, questions: current.questions.filter((question) => question.position !== position).map((question, index) => ({ ...question, position: index + 1 })) }));
  const save = async (start: boolean) => {
    if (!generated || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const ready = { ...generated, status: "ready" as const, updatedAt: new Date().toISOString() };
      await onSave(ready);
      if (start) await onStart(ready);
      else onClose();
    } catch (error) {
      setActionError(error instanceof Error && error.message ? error.message : start ? "모의고사를 시작하지 못했습니다." : "모의고사를 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };
  return <Dialog open onClose={onClose} className="modal-card exam-builder-modal" ariaLabel="모의고사 만들기" closeDisabled={busy} busy={busy}>
    <header className="modal-header"><div><p className="modal-eyebrow">모의고사 만들기</p><h2>{step === "setup" ? "문제 세트를 조립합니다" : "조립 결과를 검토합니다"}</h2><p>저장된 문제를 난이도, 중요도, 품질, 단원 및 복습 상태에 따라 선별합니다.</p></div><button type="button" className="btn-icon" aria-label="모의고사 만들기 닫기" onClick={onClose}>✕</button></header>
    {actionError && <p className="form-error" role="alert">{actionError}</p>}
    {step === "setup" ? <div className="exam-builder-body"><section><h3>1. 만들 유형</h3><div className="exam-builder-presets">{PRESETS.map((item) => <button type="button" className={preset === item.id ? "is-selected" : ""} key={item.id} onClick={() => setPreset(item.id)}><strong>{item.title}</strong><small>{item.description}</small></button>)}</div></section><section className="exam-builder-grid"><label>시험 제목<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>문제 수<select value={count} onChange={(event) => setCount(Number(event.target.value))}>{[5, 10, 15, 20, 30].map((value) => <option key={value} value={value}>{value}문항</option>)}</select></label><label>과목<select value={subject} onChange={(event) => setSubject(event.target.value)}><option value="">전체 과목</option>{subjects.map((value) => <option key={value}>{value}</option>)}</select></label></section><details className="exam-builder-filters"><summary>세부 필터</summary><label><input type="checkbox" checked={Boolean(filters.excludeNeedsReview)} onChange={(event) => setFilters((value) => ({ ...value, excludeNeedsReview: event.target.checked }))} /> 검수 필요 문항 제외</label><label><input type="checkbox" checked={Boolean(filters.requireAnswers)} onChange={(event) => setFilters((value) => ({ ...value, requireAnswers: event.target.checked }))} /> 정답 연결 문항만</label><label><input type="checkbox" checked={Boolean(filters.requireExplanations)} onChange={(event) => setFilters((value) => ({ ...value, requireExplanations: event.target.checked }))} /> 해설 연결 문항만</label><label>출처당 최대 문항<input type="number" min="1" max={count} value={filters.maxPerSource ?? Math.max(1, Math.ceil(count * .3))} onChange={(event) => setFilters((value) => ({ ...value, maxPerSource: Number(event.target.value) || undefined }))} /></label></details><footer><button type="button" className="btn-secondary" onClick={onClose}>취소</button><button type="button" onClick={() => assemble()}>자동 조립</button></footer></div> : <div className="exam-builder-body"><section className="exam-builder-report"><strong>{generated?.questions.length} / {count}문항</strong><span>후보 {generated?.generationReport.candidateCount}개</span>{generated?.generationReport.warnings.map((warning) => <p key={warning} className="form-error">{warning}</p>)}{generated?.generationReport.relaxedConstraints.map((message) => <p key={message}>{message}</p>)}</section><ol className="exam-builder-question-list">{generated?.questions.map((question) => <li key={`${question.source.sourceEntryId}-${question.source.sourceQuestionNumber}`}><div><strong>{question.position}. {question.snapshot.questionNumber}번</strong><p>{formatQuestionSourceLabel(question.source)} · {sourceStatusLabel(question.source.sourceStatus ?? "unknown")}</p><p>{question.snapshot.question.slice(0, 110)}</p><small>{question.selectionReasons.join(" · ")}</small></div><div><button type="button" className={question.locked ? "is-selected" : ""} onClick={() => toggleLocked(question.position)}>{question.locked ? "고정됨" : "문항 고정"}</button><button type="button" onClick={() => exclude(question.position)}>제외</button></div></li>)}</ol><footer><button type="button" className="btn-secondary" onClick={() => setStep("setup")}>조건 수정</button><button type="button" className="btn-secondary" onClick={() => assemble(seed())}>고정 외 다시 조립</button><button type="button" disabled={busy || !generated?.questions.length} onClick={() => void save(false)}>저장</button><button type="button" disabled={busy || !generated?.questions.length} onClick={() => void save(true)}>{busy ? "저장 중…" : "지금 풀기"}</button></footer></div>}
  </Dialog>;
}
