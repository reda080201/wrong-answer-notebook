import { useMemo, useState } from "react";
import type { LearningBlock, SimilarQuestionLink, WrongAnswerEntry } from "../../../types";
import type { QuestionBankItem } from "../model/questionBankTypes";
import { buildSimilarQuestionContext, createSimilarQuestionLink, rankLocalSimilarQuestions, approveSimilarQuestionLinks, rejectSimilarQuestionLinks } from "../utils/similarQuestionLinks";

interface Props {
  entryId: string;
  block: LearningBlock;
  entrySubject?: string;
  items: QuestionBankItem[];
  onOpen: (entryId: string, questionNumber: string) => void;
  onChange: (links: SimilarQuestionLink[]) => Promise<void>;
}

const EMPTY_LINKS: SimilarQuestionLink[] = [];

export default function SimilarQuestionLinksPanel({ entryId, block, entrySubject, items, onOpen, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const links = block.similarQuestionLinks ?? EMPTY_LINKS;
  const context = useMemo(() => buildSimilarQuestionContext({ id: entryId, subject: entrySubject, entryKind: "lecture", title: block.title, question: "", learningBlocks: [block] } as unknown as WrongAnswerEntry), [block, entryId, entrySubject]);
  const suggestions = useMemo(() => rankLocalSimilarQuestions(context, items, links), [context, items, links]);
  const update = async (next: SimilarQuestionLink[]) => { setBusy(true); try { await onChange(next); } finally { setBusy(false); } };
  const approved = links.filter((link) => link.status === "approved");
  return <section className="similar-question-links" aria-label="관련 문제">
    <header><strong>관련 문제 {approved.length}개</strong><button type="button" onClick={() => setOpen((value) => !value)} disabled={busy}>{open ? "추천 닫기" : "유사 문제 찾기"}</button></header>
    {approved.length > 0 && <ul>{approved.map((link) => { const item = items.find((candidate) => candidate.entryId === link.targetEntryId && candidate.questionNumber === link.targetQuestionNumber); return <li key={link.id}>{item ? <button type="button" onClick={() => onOpen(item.entryId, item.questionNumber)}>{item.entryTitle} {item.questionNumber}번 · {link.score ?? 0}점</button> : <span>연결된 문제를 찾을 수 없음</span>}<button type="button" aria-label="관련 문제 연결 해제" onClick={() => void update(links.filter((candidate) => candidate.id !== link.id))} disabled={busy}>해제</button></li>; })}</ul>}
    {open && <div className="similar-question-suggestions"><p>현재 저장된 문제에서만 추천합니다.</p>{suggestions.map((suggestion) => { const existing = links.find((link) => link.targetEntryId === suggestion.candidate.entryId && link.targetQuestionNumber === suggestion.candidate.questionNumber); return <article key={suggestion.candidate.id}><div><strong>{suggestion.candidate.entryTitle} {suggestion.candidate.questionNumber}번</strong><span>{suggestion.score}점 · {suggestion.reasons.join(", ") || "관련 후보"}</span></div><button type="button" onClick={() => onOpen(suggestion.candidate.entryId, suggestion.candidate.questionNumber)}>열기</button><button type="button" disabled={busy || Boolean(existing)} onClick={() => void update([...links.filter((link) => link.targetEntryId !== suggestion.candidate.entryId || link.targetQuestionNumber !== suggestion.candidate.questionNumber), ...approveSimilarQuestionLinks([createSimilarQuestionLink(suggestion)])])}>연결</button><button type="button" disabled={busy || Boolean(existing)} onClick={() => void update([...links, ...rejectSimilarQuestionLinks([createSimilarQuestionLink(suggestion)])])}>거절</button></article>; })}</div>}
  </section>;
}
