import MathText from "../../components/MathText";
import { clearAiExamDraft, loadAiStudyStore, saveAiExamDraft } from "./storage";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GeneratedExam, GeneratedExamQuestion, WrongAnswerEntry } from "../../types";
import { normalizeQuestionNumber } from "../../utils/questionMeta";
import { useAppDialog } from "../../shared/ui/AppDialogProvider";
import Dialog from "../../shared/ui/Dialog";
import QuestionContentView from "../../components/QuestionContentView";
import SourceReference from "../exam-builder/components/SourceReference";
import AiMaterialPicker from "./AiMaterialPicker";
import { buildAiContext, DEFAULT_AI_SHARING, type AiMaterial, type AiSharing } from "./model";
import { AI_EXAM_TEMPLATES, examMaterials, limitExamMaterials, proposalFromSelection, proposalInstruction, resolveProposalMaterial, validateExamSelection, type AiExamConfig } from "./examProposal";
import { requestStudyAi } from "./api";
import { assertStudyAiSourcesAllowed } from "./requestPolicy";
export default function AiExamComposer({ entries, initialMaterials = [], initialProposal, onProposal, onSave, onStart, onClose, onBack, draftId = "composer" }: {
    entries: WrongAnswerEntry[];
    initialMaterials?: AiMaterial[];
    initialProposal?: GeneratedExam;
    onProposal?(exam: GeneratedExam): Promise<void> | void;
    onSave(exam: GeneratedExam): Promise<void> | void;
    onStart(exam: GeneratedExam): Promise<void> | void;
    onClose(): void;
    onBack?(): void;
    draftId?: string;
}) {
    const { confirm } = useAppDialog();
    const available = useMemo(() => examMaterials(entries, {}), [entries]);
    const [materials, setMaterials] = useState<AiMaterial[]>(() => structuredClone(initialMaterials));
    const [sharing, setSharing] = useState<AiSharing>({ ...DEFAULT_AI_SHARING, images: false });
    const [config, setConfig] = useState<AiExamConfig>({ title: initialProposal?.title ?? "AI 문제 모음", subject: "", count: initialProposal?.questions.length ?? 10, minutes: initialProposal?.timeLimitMinutes ?? 30, points: initialProposal?.totalPoints ?? 100, maxPerSource: 10, easy: 0, medium: 0, hard: 0, unitCounts: {}, prioritizeImportance: true, instruction: "" });
    const [proposal, setProposal] = useState<GeneratedExam | null>(initialProposal ?? null);
    const [excluded, setExcluded] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [scopeBusy,setScopeBusy]=useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [draftNotice,setDraftNotice]=useState("");
    const [onlyReviewed, setOnlyReviewed] = useState(true);
    const [requireAnswers, setRequireAnswers] = useState(false);
    const [requireExplanations, setRequireExplanations] = useState(false);
    const [template, setTemplate] = useState("free");
    const [draftLoading, setDraftLoading] = useState(true);
    const [draftReady, setDraftReady] = useState(false);
    const abort = useRef<AbortController | null>(null);
    const lock = useRef(false);
    const alive = useRef(true);
    const savedStage = useRef<{ fingerprint: string; exam: GeneratedExam; examSaved: boolean; proposalSaved: boolean; draftSaved: boolean } | null>(null);
    useEffect(() => { alive.current = true; return () => { alive.current = false; abort.current?.abort(); }; }, []);
    useEffect(() => { let live = true; void loadAiStudyStore().then(store => { if (!live)
        return; const draft = store.drafts?.find(d => d.id === draftId); if (draft) {
        setMaterials(draft.materials);
        setSharing({ ...draft.sharing, answers: false, explanations: false });
        setConfig(draft.config);
        setProposal(draft.proposal ?? null);
        setExcluded(draft.excluded);
        setTemplate(draft.template);
        if (draft.filters) {
            setOnlyReviewed(draft.filters.onlyReviewed);
            setRequireAnswers(draft.filters.requireAnswers);
            setRequireExplanations(draft.filters.requireExplanations);
        }
    } setDraftReady(true); }).catch(e => { if (live)
        setError(e instanceof Error ? e.message : "초안 읽기 실패"); }).finally(() => { if (live)
        setDraftLoading(false); }); return () => { live = false; }; }, [draftId]);
    const persistDraft = async (next = proposal) => { if (!draftReady)
        throw new Error("초안을 불러오지 못해 덮어쓰기를 차단했습니다. 창을 닫고 다시 시도하세요."); await saveAiExamDraft({ id: draftId, materials, sharing, config, proposal: next ?? undefined, excluded, template, filters: { onlyReviewed, requireAnswers, requireExplanations } }); };
    const closeDraft = async (back = false) => { if (lock.current)
        return; lock.current = true; setSaving(true); try {
        await persistDraft();
        if (back)
            onBack?.();
        else
            onClose();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "초안 저장 실패");
    }
    finally {
        lock.current = false;
        setSaving(false);
    } };
    useEffect(()=>{const handle=(event:Event)=>{if((event as CustomEvent<boolean>).detail){abort.current?.abort();setDraftReady(false);setError("백업·복원 작업으로 초안 쓰기를 중지했습니다. 기존 초안을 보존하고 닫은 뒤 다시 여세요.");}};window.addEventListener("ai-study-maintenance",handle);return()=>window.removeEventListener("ai-study-maintenance",handle);},[]);
    const candidates = useMemo(() => {
        const originalKey = (m: AiMaterial) => JSON.stringify([m.source.sourceEntryId, normalizeQuestionNumber(m.source.sourceQuestionNumber)]);
        const excludedOriginals = new Set(materials.filter(m => excluded.includes(m.id) && m.source.sourceEntryId && normalizeQuestionNumber(m.source.sourceQuestionNumber)).map(originalKey));
        return limitExamMaterials(materials.filter(m => (!config.subject || m.source.sourceSubject === config.subject) && !excluded.includes(m.id) && !excludedOriginals.has(originalKey(m)) && (!onlyReviewed || !m.snapshot.needsReview) && (!requireAnswers || m.snapshot.correctAnswer) && (!requireExplanations || m.snapshot.explanation)), 80, config.prioritizeImportance);
    }, [materials, config.subject, config.prioritizeImportance, excluded, onlyReviewed, requireAnswers, requireExplanations]);
    const units = [...new Set(materials.flatMap(m => m.units))];
    const changeScope = async(next:AiMaterial[],options:AiSharing)=>{
      if(lock.current || !draftReady)return;lock.current=true;setScopeBusy(true);
      try {
        if(options.images&&!sharing.images&&!(await confirm({title:"그림 입력 지원 확인",message:"연결 모델이 그림 입력을 지원하는지 확인하세요. 그림을 API로 전송할까요?"})))return;
        if((options.answers||options.explanations)&&!(await confirm({title:"정답·해설 전송 허용",message:"선택한 정답·해설을 API 제공자에게 전송하도록 허용할까요?"})))return;
        setMaterials(structuredClone(next));setSharing(options);setProposal(null);setExcluded([]);setError("");
      }finally{lock.current=false;setScopeBusy(false);}
    };
    const propose = async () => {
        if (lock.current || !draftReady)
            return;
        lock.current = true;
        setError("");
        setBusy(true);
        const controller = new AbortController();
        abort.current = controller;
        try {
            if (!draftReady)
                throw new Error("구성 초안을 먼저 불러오세요.");
            if (!Number.isInteger(config.count) || config.count < 1 || config.count > 100 || config.points <= 0 || config.minutes <= 0 || config.maxPerSource < 1)
                throw new Error("문항 수·시간·총점·출처 제한을 확인하세요.");
            if (candidates.length < config.count)
                throw new Error(`검토 가능한 후보 ${candidates.length}개로 ${config.count}문항을 채울 수 없습니다. 후보를 추가하거나 문항 수를 직접 줄이세요.`);
            if (candidates.some(m => m.groupMemberIds?.some(id => !candidates.some(candidate => candidate.id === id))))
                throw new Error("공통 지문 묶음의 일부가 범위나 필터에서 빠졌습니다. 묶음 전체를 추가하거나 해당 문항을 제외하세요.");
            const context = buildAiContext(candidates, sharing);
            assertStudyAiSourcesAllowed(candidates.map(m => m.source.sourceEntryId));
            const response = await requestStudyAi({ context: context.text, images: context.images, sourceEntryIds: candidates.map(m => m.source.sourceEntryId), json: true, messages: [{ role: "user", text: proposalInstruction(config, proposal, candidates) }] }, controller.signal);
            if(controller.signal.aborted || !alive.current)return;
            const next = proposalFromSelection(response, candidates, config, proposal);
            await persistDraft(next);
            if(controller.signal.aborted || !alive.current)return;
            await onProposal?.(next);
            setProposal(next);
        }
        catch (e) {
            if (!controller.signal.aborted)
                setError(e instanceof Error ? e.message : "AI 구성에 실패했습니다.");
        }
        finally {
            if (abort.current === controller) {
                setBusy(false);
                lock.current = false;
                abort.current = null;
            }
        }
    };
    const updateProposal = (next: GeneratedExam) => { setProposal(next); setError(""); void Promise.resolve(onProposal?.(next)).catch(e => setError(String(e))); };
    const save = async (start: boolean) => {
        if (!proposal || lock.current)
            return;
        lock.current = true;
        setSaving(true);
        setError("");
        try {
            const selected = proposal.questions.map(q => {
                return { id: resolveProposalMaterial(q, candidates).id, points: q.points ?? q.snapshot.points ?? 0, reason: q.selectionReasons.join(" ") };
            });
            validateExamSelection(selected, candidates, config);
            assertStudyAiSourcesAllowed(proposal.questions.map(q => q.source.sourceEntryId));
            const value = { ...proposal, questions: proposal.questions.map(q => ({ ...q, snapshot: { ...q.snapshot, points: q.points ?? q.snapshot.points } })), title: config.title, subject: config.subject || proposal.subject, timeLimitMinutes: config.minutes, totalPoints: config.points, status: "ready" as const };
            const fingerprint = JSON.stringify({ ...value, updatedAt: "" });
            if (savedStage.current?.fingerprint !== fingerprint) savedStage.current = { fingerprint, exam: { ...value, updatedAt: new Date().toISOString() }, examSaved: false, proposalSaved: false, draftSaved: false };
            const stage = savedStage.current;
            const ready = stage.exam;
            if (!stage.examSaved) { await onSave(ready); stage.examSaved = true; }
            setProposal(ready);
            setDraftNotice("시험 저장 완료. 구성 기록 정리와 시험 시작은 실패 시 다시 시도할 수 있습니다.");
            if(onProposal){
                if (!stage.proposalSaved) { await onProposal(ready); stage.proposalSaved = true; }
                if (!stage.draftSaved) { await persistDraft(ready); stage.draftSaved = true; }
            } else if (!stage.draftSaved) { await clearAiExamDraft(draftId); stage.draftSaved = true; }
            assertStudyAiSourcesAllowed(ready.questions.map(q => q.source.sourceEntryId));
            if (start)
                await onStart(ready);
            else
                onClose();
        }
        catch (e) {
            setError(`${savedStage.current?.examSaved ? "시험은 저장되었습니다. 남은 작업을 재시도하세요. " : ""}${e instanceof Error ? e.message : "저장 실패"}`);
        }
        finally {
            lock.current = false;
            setSaving(false);
        }
    };
    const saveDraftOnly = async () => {
        if (lock.current) return;
        lock.current = true; setSaving(true);
        try { await persistDraft(); setDraftNotice("구성 초안을 이 기기에 저장했습니다."); }
        catch (e) { setError(e instanceof Error ? e.message : "초안 저장 실패"); }
        finally { lock.current = false; setSaving(false); }
    };
    const toggleExcluded = (question: GeneratedExamQuestion) => {
        if (lock.current || question.locked || !draftReady) return;
        const number = normalizeQuestionNumber(question.source.sourceQuestionNumber);
        const ids = materials.filter(m => question.source.sourceEntryId && number && m.source.sourceEntryId === question.source.sourceEntryId && normalizeQuestionNumber(m.source.sourceQuestionNumber) === number).map(m => m.id);
        if (!ids.length) { setError("제외할 원본 문항을 확인할 수 없습니다. 후보 범위를 확인하세요."); return; }
        setExcluded(excluded.some(id => ids.includes(id)) ? excluded.filter(id => !ids.includes(id)) : [...new Set([...excluded, ...ids])]);
        if (proposal) updateProposal({ ...proposal });
    };
    return <Dialog open onClose={() => void closeDraft()} className="ai-exam-composer" ariaLabel="AI 모의고사 구성" closeDisabled={busy || saving || scopeBusy} header={<><h2>AI 모의고사 구성</h2><button type="button" disabled={busy || saving || scopeBusy || draftLoading || !draftReady} onClick={() => void closeDraft()} aria-label="AI 구성 닫기">✕</button></>} footer={<div className="ai-inline-actions">{busy ? <button onClick={() => abort.current?.abort()}>응답 중지</button> : <button disabled={scopeBusy || saving || !draftReady || draftLoading} onClick={() => void propose()}>구성안 {proposal ? "다시 제안" : "요청"}</button>}<button disabled={!proposal || busy || saving || scopeBusy || !draftReady || draftLoading} onClick={() => void save(false)}>검토한 구성 저장</button><button disabled={!proposal || busy || saving || scopeBusy || !draftReady || draftLoading} onClick={() => void save(true)}>저장하고 풀기</button></div>}>
    {draftLoading && <p role="status">구성 초안 불러오는 중…</p>}
    {!draftLoading && !draftReady && <button onClick={onClose}>기존 초안 보존하고 닫기</button>}
    <button disabled={busy || saving || scopeBusy || !draftReady} onClick={() => void saveDraftOnly()}>구성 초안 저장</button>{draftNotice&&<p role="status">{draftNotice}</p>}
    {onBack && <div className="ai-inline-actions"><button disabled={busy || saving || scopeBusy || draftLoading || !draftReady} onClick={() => void closeDraft(true)}>직접 구성</button><button aria-pressed>AI 구성</button></div>}
    <fieldset disabled={busy || saving || scopeBusy || draftLoading || !draftReady} className="ai-exam-options"><label>형식<select value={template} onChange={e => { const t = AI_EXAM_TEMPLATES.find(t => t.id === e.target.value)!; setTemplate(t.id); setConfig(c => ({ ...c, subject: t.subject, count: t.count, minutes: t.minutes, points: t.points, maxPerSource: t.count, easy: 0, medium: 0, hard: 0 })); }}>{AI_EXAM_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label><p>앱의 편집 가능한 수능형 틀입니다. 공식 출제 범위·선택과목·듣기 자료는 별도로 확인하세요.</p>
    <label>제목<input value={config.title} onChange={e => setConfig({ ...config, title: e.target.value })}/></label><label>과목<select value={config.subject} onChange={e => setConfig({ ...config, subject: e.target.value })}><option value="">전체</option>{[...new Set(entries.map(e => e.subject))].map(s => <option key={s}>{s}</option>)}</select></label>
    {([['count', '문항 수'], ['minutes', '시간(분)'], ['points', '총점'], ['maxPerSource', '출처당 최대'], ['easy', '하 난이도 수'], ['medium', '중 난이도 수'], ['hard', '상 난이도 수']] as const).map(([key, label]) => <label key={key}>{label}<input type="number" min={['easy', 'medium', 'hard'].includes(key) ? 0 : 1} max={key === 'minutes' ? 300 : 1000} value={config[key]} onChange={e => setConfig({ ...config, [key]: Number(e.target.value) })}/></label>)}<p>난이도 수를 모두 0으로 두면 배분을 자유롭게 제안합니다. 하 1~35 · 중 36~70 · 상 71~100. 미평가 문항은 별도로 설명합니다.</p>
    <label><input type="checkbox" checked={config.prioritizeImportance} onChange={e => setConfig({ ...config, prioritizeImportance: e.target.checked })}/>중요도 우선</label><label><input type="checkbox" checked={onlyReviewed} onChange={e => setOnlyReviewed(e.target.checked)}/>검토 필요 문항 제외</label><label><input type="checkbox" checked={requireAnswers} onChange={e => setRequireAnswers(e.target.checked)}/>정답 연결 필수</label><label><input type="checkbox" checked={requireExplanations} onChange={e => setRequireExplanations(e.target.checked)}/>해설 연결 필수</label>
    {!!units.length && <details><summary>단원별 문항 수</summary>{units.map(unit => <label key={unit}>{unit}<input type="number" min="0" max={config.count} value={config.unitCounts[unit] ?? 0} onChange={e => setConfig({ ...config, unitCounts: { ...config.unitCounts, [unit]: Number(e.target.value) } })}/></label>)}</details>}
    <label>대화로 구성 수정<textarea placeholder="예: 뒤쪽을 더 어렵게, 3번은 고정하고 앞부분을 교체해 줘" value={config.instruction} onChange={e => setConfig({ ...config, instruction: e.target.value })}/></label></fieldset>
    <AiMaterialPicker available={available} selected={materials} sharing={sharing} disabled={busy || saving || scopeBusy || draftLoading || !draftReady} onChange={(m, s) => void changeScope(m, s)}/>
    <p role="status">선택 {materials.length}문항 · 이번 요청 검토 후보 {candidates.length}문항 · 필터·제외·한도 밖 {materials.length - candidates.length}문항. 한 요청은 공통 지문 묶음을 유지하며 최대 80문항입니다. 더 큰 범위는 자료를 나누어 검토하세요.</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    {proposal && <section><h3>구성안 · {proposal.questions.length}문항</h3>{proposal.generationReport.warnings.map((w, i) => <p key={i}>{w}</p>)}<label><input type="checkbox" checked={proposal.showSourceReferences !== false} onChange={e => updateProposal({ ...proposal, showSourceReferences: e.target.checked })}/>출처 표시</label><ol className="ai-proposal-list">{proposal.questions.map((q, index) => <li key={`${q.source.sourceEntryId}-${q.source.sourceQuestionNumber}`}>{proposal.showSourceReferences !== false && <SourceReference source={q.source} onBeforeNavigate={async()=>{await persistDraft();onClose();}}/>}<div className="ai-proposal-heading"><strong>{q.position}번</strong><label>배점<input type="number" min="1" value={q.points ?? q.snapshot.points ?? 0} onChange={e => updateProposal({ ...proposal, questions: proposal.questions.map((v, i) => i === index ? { ...v, points: Number(e.target.value) } : v) })}/></label></div>{q.snapshot.passage && (!q.snapshot.stimulusGroupId || proposal.questions[index-1]?.snapshot.stimulusGroupId !== q.snapshot.stimulusGroupId) && <section className="exam-passage"><QuestionContentView text={q.snapshot.passage} figures={q.snapshot.figures}/></section>}<QuestionContentView text={q.snapshot.question} segments={q.snapshot.contentSegments} figures={q.snapshot.figures}/>{q.snapshot.choices.length>0&&<ol className="ai-proposal-choices">{q.snapshot.choices.map((choice,i)=><li key={i}><MathText text={choice}/></li>)}</ol>}<p>{q.selectionReasons.join(" · ")}</p><div className="ai-inline-actions"><button disabled={busy || saving || scopeBusy || draftLoading || !draftReady} onClick={() => updateProposal({ ...proposal, questions: proposal.questions.map((v, i) => i === index ? { ...v, locked: !v.locked } : v) })}>{q.locked ? "고정됨" : "문항 고정"}</button><button disabled={busy || saving || q.locked} onClick={() => toggleExcluded(q)}>{excluded.some(id => materials.find(m => m.id === id)?.source.sourceEntryId === q.source.sourceEntryId && materials.find(m => m.id === id)?.source.sourceQuestionNumber === q.source.sourceQuestionNumber) ? "제외 취소" : "제외하고 대체 요청"}</button>{[-1, 1].map(offset => <button key={offset} disabled={busy || saving || q.locked || !proposal.questions[index + offset] || proposal.questions[index + offset]?.locked} onClick={() => { const list = [...proposal.questions]; [list[index], list[index + offset]] = [list[index + offset], list[index]]; updateProposal({ ...proposal, questions: list.map((q, i) => ({ ...q, position: i + 1 })) }); }}>{offset < 0 ? "위로" : "아래로"}</button>)}</div></li>)}</ol></section>}
  </Dialog>;
}
