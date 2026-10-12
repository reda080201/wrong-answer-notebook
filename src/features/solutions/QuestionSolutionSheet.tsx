import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import Dialog from "../../shared/ui/Dialog";
import MathText from "../../components/MathText";
import SolutionContent from "./SolutionContent";
import type { SolutionQuestion } from "./solutionModel";
import "./solutions.css";

interface Props {
  questions: SolutionQuestion[];
  questionKey: string;
  hidden?: boolean;
  onReveal?(): void;
  onNavigate(key: string): void;
  onClose(): void;
  pageNotice?: string;
  returnFocusRegionRef?: RefObject<HTMLElement | null>;
}

export default function QuestionSolutionSheet({ questions, questionKey, hidden = false, onReveal, onNavigate, onClose, pageNotice, returnFocusRegionRef }: Props) {
  const [full, setFull] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const [openerRegion] = useState(() => document.activeElement?.closest(".original-page-reader") ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const dragRef = useRef<{ y: number; full: boolean } | null>(null);
  const index = questions.findIndex(question => question.key === questionKey);
  const question = questions[index];
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [questionKey]);
  const go = (next: number) => {
    if (!questions[next]) return;
    if (next === 0 || next === questions.length - 1) frameRef.current?.querySelector<HTMLButtonElement>(".solution-sheet-handle")?.focus();
    onNavigate(questions[next].key);
  };
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const dialog = frameRef.current?.closest('[role="dialog"]');
      const layers = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][data-dialog-layer]'));
      const topmost = layers.reduce<HTMLElement | null>((top, candidate) => !top || Number(candidate.dataset.dialogLayer) > Number(top.dataset.dialogLayer) ? candidate : top, null);
      if (!dialog || topmost !== dialog || !(event.target instanceof Node) || (!dialog.contains(event.target) && event.target !== document.body) || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault(); event.stopImmediatePropagation();
      const next = questions[index + (event.key === "ArrowRight" ? 1 : -1)];
      if (next) {
        frameRef.current?.querySelector<HTMLButtonElement>(".solution-sheet-handle")?.focus();
        onNavigate(next.key);
      }
    };
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [index, onNavigate, questions]);
  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current; dragRef.current = null;
    if (!drag) return;
    const dy = event.clientY - drag.y;
    if (dy < -48) setFull(true);
    else if (dy > 64) { if (drag.full) setFull(false); else onClose(); }
  };
  if (!question) return null;
  return <Dialog open onClose={onClose} returnFocusFallback={() => {
    const region = returnFocusRegionRef?.current ?? openerRegion;
    if (!region?.isConnected) return null;
    return Array.from(region.querySelectorAll<HTMLElement>("[data-solution-question-key]")).find(dot => dot.dataset.solutionQuestionKey === questionKey)
      ?? region.querySelector<HTMLElement>(".original-page-viewport");
  }} ariaLabel={`정답·해설 ${question.number}번`} className={`solution-sheet${full ? " solution-sheet--full" : ""}`} backdropClassName="solution-sheet-backdrop" scrollMode="custom" bodyClassName="solution-sheet-shell">
    <div ref={frameRef} className="solution-sheet-frame">
      <button type="button" className="solution-sheet-handle" aria-label={full ? "해설창 축소" : "해설창 전체 높이로 확대"} aria-expanded={full} onClick={() => { if (suppressClickRef.current) { suppressClickRef.current = false; return; } setFull(value => !value); }} onPointerDown={event => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { y: event.clientY, full }; }} onPointerUp={event => { event.stopPropagation(); const dragged = dragRef.current && Math.abs(event.clientY - dragRef.current.y) > 12; finishDrag(event); if (dragged) { suppressClickRef.current = true; event.preventDefault(); } }} onPointerCancel={() => { dragRef.current = null; }}><span /></button>
      <header className="solution-sheet-header"><strong>정답·해설 <span>| {question.number}번</span></strong><nav aria-label="해설 문항 이동">
        <button type="button" aria-label="이전 문항 해설" disabled={index <= 0} onClick={() => go(index - 1)}>←</button>
        <button type="button" aria-label="다음 문항 해설" disabled={index >= questions.length - 1} onClick={() => go(index + 1)}>→</button>
        <button type="button" onClick={() => setFull(value => !value)}>{full ? "축소" : "전체 높이"}</button>
        <button type="button" onClick={onClose} aria-label="해설창 닫기">닫기</button>
      </nav></header>
      <div ref={scrollRef} className="solution-sheet-content">
        {pageNotice && <p className="solution-sheet-notice" role="status">{pageNotice}</p>}
        <div className="solution-sheet-number"><strong>{question.number}</strong>{!hidden && question.answer && <span>정답 <MathText text={question.answer.answer || "정보 없음"} /></span>}</div>
        {hidden ? <div><p>정답과 해설이 가려져 있습니다.</p><button type="button" onClick={onReveal}>이 문항 정답·해설 보기</button></div> : question.answer ? <SolutionContent answer={question.answer} figures={question.figures} showAnswer={false} /> : <p role="status">이 문항의 답안 연결을 확인해 주세요. 연결된 정답·해설을 찾지 못했습니다.</p>}
      </div>
    </div>
  </Dialog>;
}
