import { useEffect, useMemo, useState } from "react";
import type { StudyReviewResult, StudySession, WrongAnswerEntry } from "../../../types";
import { resolveStudyItem, scheduleManualStudyReview } from "../utils/studyItems";

export default function StudySessionView({ session, entries, onChange, onClose }: { session: StudySession; entries: WrongAnswerEntry[]; onChange: (session: StudySession) => Promise<void>; onClose: () => void }) {
  const [current, setCurrent] = useState(session);
  const [revealed, setRevealed] = useState(false);
  const activeRef = current.itemRefs[current.currentIndex];
  const item = useMemo(() => activeRef ? resolveStudyItem(activeRef, entries) : null, [activeRef, entries]);
  useEffect(() => { setRevealed(false); }, [activeRef?.id]);
  const review = async (result: StudyReviewResult) => {
    if (!activeRef) return;
    const order = scheduleManualStudyReview(current.itemRefs.map((ref) => ref.id), activeRef.id, result);
    const refs = order.map((id) => current.itemRefs.find((ref) => ref.id === id)!).filter(Boolean);
    const nextIndex = result === "known" ? Math.min(current.currentIndex, Math.max(0, refs.length - 1)) : 0;
    const next: StudySession = { ...current, itemRefs: refs, currentIndex: nextIndex, status: refs.length ? "in_progress" : "completed", reviewEvents: [...current.reviewEvents, { id: crypto.randomUUID(), itemId: activeRef.id, result, reviewedAt: new Date().toISOString() }], updatedAt: new Date().toISOString() };
    setCurrent(next);
    await onChange(next);
  };
  if (!item) return <section className="study-session-empty"><p>원본 문항을 찾지 못했거나 검수가 필요합니다.</p><button type="button" onClick={onClose}>학습 목록으로</button></section>;
  return <section className="study-session" aria-label="학습 세션">
    <header><div><span>수동 학습</span><h2>{current.title}</h2></div><button type="button" onClick={onClose}>닫기</button></header>
    <p className="study-session-position">{current.currentIndex + 1} / {current.itemRefs.length}</p>
    <article className="study-session-item"><h3>{item.title}</h3><p>{item.prompt}</p>{revealed && <div className="study-session-reveal"><strong>확인</strong><p>{item.answer ?? "정답·해설은 원본에서 확인하세요."}</p></div>}<button type="button" onClick={() => setRevealed((value) => !value)}>{revealed ? "내용 숨기기" : "답·해설 보기"}</button></article>
    <footer className="study-session-actions"><button type="button" onClick={() => void review("again")}>다시</button><button type="button" onClick={() => void review("hard")}>어려움</button><button type="button" onClick={() => void review("known")}>알겠음</button></footer>
  </section>;
}
