import { useEffect, useMemo, useRef, useState } from "react";
import type { LearningBlock, SimilarQuestionLink, WrongAnswerEntry } from "../../../types";
import type { QuestionBankItem } from "../model/questionBankTypes";
import {
  approveSimilarQuestionLinks,
  buildSimilarQuestionContext,
  createSimilarQuestionLink,
  parseGeminiSimilarQuestionRanking,
  prepareSimilarQuestionRankingRequest,
  rankLocalSimilarQuestions,
  rejectSimilarQuestionLinks,
  toSimilarQuestionCandidatePayload,
  type LocalSimilarQuestion,
  type SimilarQuestionRankingResponse,
} from "../utils/similarQuestionLinks";
import { rankSimilarQuestionsWithAi } from "../../../api";

interface Props {
  sourceEntry: WrongAnswerEntry;
  block?: LearningBlock;
  links: SimilarQuestionLink[];
  items: QuestionBankItem[];
  onOpen: (entryId: string, questionNumber: string) => void;
  onChange: (links: SimilarQuestionLink[]) => Promise<void>;
  label?: string;
}

function linkKey(link: SimilarQuestionLink) {
  return `${link.targetEntryId}:${link.targetQuestionNumber}`;
}

function linksSignature(links: SimilarQuestionLink[]) {
  return [...links]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((link) => [
      link.id,
      link.targetEntryId,
      link.targetQuestionNumber,
      link.status,
      link.score ?? "",
      link.updatedAt,
    ].join(":"))
    .join("|");
}

export default function SimilarQuestionLinksPanel({ sourceEntry, block, links, items, onOpen, onChange, label = "관련 문제" }: Props) {
  const [open, setOpen] = useState(false);
  const [rankingBusy, setRankingBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasRetryableSave, setHasRetryableSave] = useState(false);
  const [geminiSuggestions, setGeminiSuggestions] = useState<LocalSimilarQuestion[] | null>(null);
  const [geminiRankedIds, setGeminiRankedIds] = useState<Set<string>>(new Set());
  const [geminiProvenance, setGeminiProvenance] = useState<Pick<SimilarQuestionRankingResponse, "model" | "promptVersion"> | null>(null);
  const [payloadTruncated, setPayloadTruncated] = useState(false);
  const failedTargetRef = useRef<SimilarQuestionLink[] | null>(null);
  const failedBaseRef = useRef("");
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  const context = useMemo(() => buildSimilarQuestionContext(sourceEntry, block), [block, sourceEntry]);
  const suggestions = useMemo(() => rankLocalSimilarQuestions(context, items, links), [context, items, links]);
  const displaySuggestions = geminiSuggestions ?? suggestions;
  const linkSignature = linksSignature(links);

  useEffect(() => {
    requestIdRef.current += 1;
    setGeminiSuggestions(null);
    setGeminiRankedIds(new Set());
    setGeminiProvenance(null);
    setPayloadTruncated(false);
  }, [context, suggestions]);

  useEffect(() => {
    if (failedBaseRef.current && failedBaseRef.current !== linkSignature) {
      failedTargetRef.current = null;
      failedBaseRef.current = "";
      setHasRetryableSave(false);
      setSaveError(null);
    }
  }, [linkSignature]);

  const rerankWithGemini = async () => {
    const requestId = ++requestIdRef.current;
    setRankingBusy(true);
    setGeminiError(null);
    try {
      const candidates = suggestions.map((suggestion) => toSimilarQuestionCandidatePayload(suggestion.candidate));
      const prepared = prepareSimilarQuestionRankingRequest(context, candidates);
      if (prepared.blocked) {
        setGeminiError("후보 정보가 너무 커 Gemini 재정렬을 실행하지 않았습니다. 기존 추천을 유지합니다.");
        return;
      }
      const response = await rankSimilarQuestionsWithAi(prepared.request);
      const ranking = parseGeminiSimilarQuestionRanking(response.content, new Set(prepared.request.candidates.map((candidate) => candidate.candidateId)));
      if (mountedRef.current && requestId === requestIdRef.current) {
        if (ranking.length === 0) {
          setGeminiError("Gemini가 사용할 수 있는 재정렬 결과를 반환하지 않아 기존 추천을 유지합니다.");
          return;
        }
        const rankedById = new Map(ranking.map((result) => [result.candidateId, result]));
        setGeminiRankedIds(new Set(ranking.map((result) => result.candidateId)));
        setGeminiProvenance({ model: response.model, promptVersion: response.promptVersion });
        setPayloadTruncated(prepared.truncated);
        setGeminiSuggestions(suggestions.map((base) => {
          const result = rankedById.get(base.candidate.id);
          return result
            ? { ...base, score: result.score ?? base.score, reasons: result.reasons ?? base.reasons, sharedConcepts: result.sharedConcepts ?? base.sharedConcepts, differences: result.differences ?? base.differences }
            : base;
        }).sort((left, right) => right.score - left.score || left.candidate.id.localeCompare(right.candidate.id)));
      }
    } catch (error) {
      if (mountedRef.current && requestId === requestIdRef.current) setGeminiError(error instanceof Error ? error.message : "Gemini 재정렬에 실패했습니다.");
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) setRankingBusy(false);
    }
  };

  const save = async (next: SimilarQuestionLink[]) => {
    setSaveBusy(true);
    setSaveError(null);
    try {
      await onChange(next);
      failedTargetRef.current = null;
      failedBaseRef.current = "";
      setHasRetryableSave(false);
    } catch {
      failedTargetRef.current = next;
      failedBaseRef.current = linkSignature;
      setHasRetryableSave(true);
      setSaveError("관련 문제 연결을 저장하지 못했습니다.");
    } finally {
      if (mountedRef.current) setSaveBusy(false);
    }
  };

  const approved = links.filter((link) => link.status === "approved");
  const rejected = links.filter((link) => link.status === "rejected");
  const busy = rankingBusy || saveBusy;

  return <section className="similar-question-links" aria-label={label}>
    <header><strong>{label} {approved.length}개</strong><button type="button" onClick={() => setOpen((value) => !value)} disabled={busy}>{open ? "추천 닫기" : "유사 문제 찾기"}</button></header>
    {saveError && <p role="alert" className="form-hint">{saveError}<button type="button" className="btn-secondary" disabled={busy || !hasRetryableSave} onClick={() => { const target = failedTargetRef.current; if (target) void save(target); }}>다시 저장</button><button type="button" className="btn-secondary" disabled={busy} onClick={() => { failedTargetRef.current = null; failedBaseRef.current = ""; setHasRetryableSave(false); setSaveError(null); }}>취소</button></p>}
    {approved.length > 0 && <ul>{approved.map((link) => { const item = items.find((candidate) => candidate.entryId === link.targetEntryId && candidate.questionNumber === link.targetQuestionNumber); return <li key={link.id}>{item ? <button type="button" onClick={() => onOpen(item.entryId, item.questionNumber)}>{item.entryTitle} {item.questionNumber}번 · {link.score ?? 0}점</button> : <span>연결된 문제를 찾을 수 없음 ({link.targetEntryId} {link.targetQuestionNumber}번)</span>}<button type="button" aria-label="관련 문제 연결 해제" onClick={() => void save(links.filter((candidate) => candidate.id !== link.id))} disabled={busy}>해제</button></li>; })}</ul>}
    {rejected.length > 0 && <details><summary>거절한 후보 {rejected.length}개 관리</summary><ul>{rejected.map((link) => <li key={link.id}><span>{link.targetEntryId} {link.targetQuestionNumber}번</span><button type="button" onClick={() => void save(links.filter((candidate) => candidate.id !== link.id))} disabled={busy}>다시 추천</button></li>)}</ul></details>}
    {open && <div className="similar-question-suggestions"><p>현재 저장된 문제에서만 추천합니다.</p><button type="button" onClick={() => void rerankWithGemini()} disabled={busy || suggestions.length === 0}>Gemini로 기존 후보 재정렬</button>{payloadTruncated && <p className="form-hint">Gemini 재정렬을 위해 일부 후보 본문 또는 해설을 축약했습니다.</p>}{geminiError && <p role="alert">{geminiError}</p>}{displaySuggestions.map((suggestion) => { const existing = links.find((link) => linkKey(link) === `${suggestion.candidate.entryId}:${suggestion.candidate.questionNumber}`); const isGeminiRanked = geminiRankedIds.has(suggestion.candidate.id); const source = isGeminiRanked ? "gemini" : "local"; return <article key={suggestion.candidate.id}><div><strong>{suggestion.candidate.entryTitle} {suggestion.candidate.questionNumber}번</strong><span>{suggestion.score}점 · {suggestion.reasons.join(", ") || "관련 후보"}</span>{suggestion.sharedConcepts.length > 0 && <span>공통 개념: {suggestion.sharedConcepts.join(", ")}</span>}{suggestion.differences.length > 0 && <span>차이: {suggestion.differences.join(", ")}</span>}</div><button type="button" onClick={() => onOpen(suggestion.candidate.entryId, suggestion.candidate.questionNumber)}>열기</button><button type="button" disabled={busy || Boolean(existing)} onClick={() => void save([...links.filter((link) => linkKey(link) !== `${suggestion.candidate.entryId}:${suggestion.candidate.questionNumber}`), ...approveSimilarQuestionLinks([createSimilarQuestionLink(suggestion, source, undefined, source === "gemini" ? geminiProvenance ?? undefined : undefined)])])}>연결</button><button type="button" disabled={busy || Boolean(existing)} onClick={() => void save([...links, ...rejectSimilarQuestionLinks([createSimilarQuestionLink(suggestion)])])}>거절</button></article>; })}</div>}
  </section>;
}
