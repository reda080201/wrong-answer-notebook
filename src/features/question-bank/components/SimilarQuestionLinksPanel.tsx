import { useEffect, useMemo, useRef, useState } from "react";
import type { LearningBlock, SimilarQuestionLink, WrongAnswerEntry } from "../../../types";
import type { QuestionBankItem } from "../model/questionBankTypes";
import { buildSimilarQuestionContext, createSimilarQuestionLink, rankLocalSimilarQuestions, approveSimilarQuestionLinks, rejectSimilarQuestionLinks, type LocalSimilarQuestion } from "../utils/similarQuestionLinks";
import { rankSimilarQuestionsWithAi } from "../../../api";
import { parseGeminiSimilarQuestionRanking } from "../utils/similarQuestionLinks";

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
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [geminiSuggestions, setGeminiSuggestions] = useState<LocalSimilarQuestion[] | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  const links = block.similarQuestionLinks ?? EMPTY_LINKS;
  const context = useMemo(() => buildSimilarQuestionContext({ id: entryId, subject: entrySubject, entryKind: "lecture", title: block.title, question: "", learningBlocks: [block] } as unknown as WrongAnswerEntry), [block, entryId, entrySubject]);
  const suggestions = useMemo(() => rankLocalSimilarQuestions(context, items, links), [context, items, links]);
  const displaySuggestions = geminiSuggestions ?? suggestions;
  const rerankWithGemini = async () => {
    const requestId = ++requestIdRef.current;
    setBusy(true); setGeminiError(null);
    try {
      const candidates = suggestions.map((suggestion) => ({ candidateId: suggestion.candidate.id, questionText: suggestion.candidate.questionText, subject: suggestion.candidate.subject, classification: suggestion.candidate.classification, hasExplanation: suggestion.candidate.hasExplanation }));
      const raw = await rankSimilarQuestionsWithAi("기존 문제 후보의 유사도만 평가하고 새 문제를 생성하지 마세요. JSON results 배열만 반환하세요.", candidates);
      const ranking = parseGeminiSimilarQuestionRanking(raw, new Set(candidates.map((candidate) => candidate.candidateId)));
      const byId = new Map(suggestions.map((suggestion) => [suggestion.candidate.id, suggestion]));
      if (mountedRef.current && requestId === requestIdRef.current) setGeminiSuggestions(ranking.map((result) => { const base = byId.get(result.candidateId); return base ? { ...base, score: result.score ?? base.score, reasons: result.reasons ?? base.reasons, sharedConcepts: result.sharedConcepts ?? base.sharedConcepts, differences: result.differences ?? base.differences } : null; }).filter((item): item is NonNullable<typeof item> => Boolean(item)));
    } catch (error) { if (mountedRef.current && requestId === requestIdRef.current) setGeminiError(error instanceof Error ? error.message : "Gemini 재정렬에 실패했습니다."); } finally { if (mountedRef.current && requestId === requestIdRef.current) setBusy(false); }
  };
  const update = async (next: SimilarQuestionLink[]) => { setBusy(true); try { await onChange(next); } finally { setBusy(false); } };
  const approved = links.filter((link) => link.status === "approved");
  const rejected = links.filter((link) => link.status === "rejected");
  return <section className="similar-question-links" aria-label="관련 문제">
    <header><strong>관련 문제 {approved.length}개</strong><button type="button" onClick={() => setOpen((value) => !value)} disabled={busy}>{open ? "추천 닫기" : "유사 문제 찾기"}</button></header>
    {approved.length > 0 && <ul>{approved.map((link) => { const item = items.find((candidate) => candidate.entryId === link.targetEntryId && candidate.questionNumber === link.targetQuestionNumber); return <li key={link.id}>{item ? <button type="button" onClick={() => onOpen(item.entryId, item.questionNumber)}>{item.entryTitle} {item.questionNumber}번 · {link.score ?? 0}점</button> : <span>연결된 문제를 찾을 수 없음</span>}<button type="button" aria-label="관련 문제 연결 해제" onClick={() => void update(links.filter((candidate) => candidate.id !== link.id))} disabled={busy}>해제</button></li>; })}</ul>}
    {rejected.length > 0 && <details><summary>거절한 후보 {rejected.length}개 관리</summary><ul>{rejected.map((link) => <li key={link.id}><span>{link.targetEntryId} {link.targetQuestionNumber}번</span><button type="button" onClick={() => void update(links.filter((candidate) => candidate.id !== link.id))} disabled={busy}>다시 추천</button></li>)}</ul></details>}
    {open && <div className="similar-question-suggestions"><p>현재 저장된 문제에서만 추천합니다.</p><button type="button" onClick={() => void rerankWithGemini()} disabled={busy}>Gemini로 기존 후보 재정렬</button>{geminiError && <p role="alert">{geminiError}</p>}{displaySuggestions.map((suggestion) => { const existing = links.find((link) => link.targetEntryId === suggestion.candidate.entryId && link.targetQuestionNumber === suggestion.candidate.questionNumber); return <article key={suggestion.candidate.id}><div><strong>{suggestion.candidate.entryTitle} {suggestion.candidate.questionNumber}번</strong><span>{suggestion.score}점 · {suggestion.reasons.join(", ") || "관련 후보"}</span>{suggestion.sharedConcepts.length > 0 && <span>공통 개념: {suggestion.sharedConcepts.join(", ")}</span>}{suggestion.differences.length > 0 && <span>차이: {suggestion.differences.join(", ")}</span>}</div><button type="button" onClick={() => onOpen(suggestion.candidate.entryId, suggestion.candidate.questionNumber)}>열기</button><button type="button" disabled={busy || Boolean(existing)} onClick={() => void update([...links.filter((link) => link.targetEntryId !== suggestion.candidate.entryId || link.targetQuestionNumber !== suggestion.candidate.questionNumber), ...approveSimilarQuestionLinks([createSimilarQuestionLink(suggestion, geminiSuggestions ? "gemini" : "local")])])}>연결</button><button type="button" disabled={busy || Boolean(existing)} onClick={() => void update([...links, ...rejectSimilarQuestionLinks([createSimilarQuestionLink(suggestion)])])}>거절</button></article>; })}</div>}
  </section>;
}
