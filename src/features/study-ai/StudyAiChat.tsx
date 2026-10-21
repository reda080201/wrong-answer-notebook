import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ExamSession, GeneratedExam, WrongAnswerEntry } from "../../types";
import { useAppDialog } from "../../shared/ui/AppDialogProvider";
import { normalizeQuestionNumber } from "../../utils/questionMeta";
import AiMaterialPicker, { SHARING_LABELS } from "./AiMaterialPicker";
import AiMessageContent from "./AiMessageContent";
import AiExamComposer from "./AiExamComposer";
import { AI_BACKUP_PREFERENCE_KEY, activeContextMessages, retryableUserMessage, retryContextMessages, buildAiContext, changeAiScope, DEFAULT_AI_SHARING, emptyAiStudyStore, entryAiMaterials, type AiConversation, type AiMaterial, type AiSharing, type AiStudyStore } from "./model";
import { deleteAiConversation, discardPendingAiStudyWrites, flushAiStudyWrites, hasPendingAiStudyWrites, loadAiStudyStore, saveAiConversation } from "./storage";
import { assertStudyAiSourcesAllowed, setStudyAiSession } from "./requestPolicy";
import { useStudySelection } from "./activeSelection";
import { requestStudyAi } from "./api";
import { useChatPanelAccessibility } from "./useChatPanelAccessibility";
import "./studyAi.css";
import { useRealExamProtection } from "../exam/services/realExamProtection";
function newConversation(): AiConversation { return { id: crypto.randomUUID(), title: "새 대화", updatedAt: new Date().toISOString(), messages: [], materials: [], sharing: { ...DEFAULT_AI_SHARING }, contextId: crypto.randomUUID() }; }
export default function StudyAiChat({ entries, selectedEntryId, session, onSaveExam, onStartExam, onSettings }: {
    entries: WrongAnswerEntry[];
    selectedEntryId?: string | null;
    session: ExamSession | null;
    onSaveExam(exam: GeneratedExam): Promise<void> | void;
    onStartExam(exam: GeneratedExam): Promise<void> | void;
    onSettings(): void;
}) {
    const { confirm, prompt } = useAppDialog();
    const [includeBackup, setIncludeBackup] = useState(() => localStorage.getItem(AI_BACKUP_PREFERENCE_KEY) === "true");
    const [open, setOpen] = useState(false);
    const [store, setStore] = useState<AiStudyStore>(emptyAiStudyStore);
    const storeRef = useRef(store);
    const persistedIds = useRef(new Set<string>());
    const pendingSend = useRef<{ conversationId: string; contextId: string; messageId: string; text: string } | null>(null);
    const [activeId, setActiveId] = useState("");
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [scopeBusy,setScopeBusy]=useState(false);
    const [loading, setLoading] = useState(true);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState("");
    const [saveError, setSaveError] = useState("");
    const [composer, setComposer] = useState(false);
    const [scopeNotice, setScopeNotice] = useState("");
    const [maintenance, setMaintenance] = useState(false);
    const lock = useRef(false);
    const reloadLock = useRef(false);
    const generation = useRef(0);
    const controller = useRef<AbortController | null>(null);
    const launcher = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLElement>(null);
    const compact = useChatPanelAccessibility(open, panelRef, launcher);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const scroll = useRef<HTMLDivElement>(null);
    const active = store.conversations.find(c => c.id === activeId);
    const selection = useStudySelection();
    const protection = useRealExamProtection();
    const realActive = protection.sessions.length > 0 || (session?.mode === "real" && session.status === "in_progress");
    useLayoutEffect(() => {
        setStudyAiSession(session);
        const current = storeRef.current.conversations.find(c => c.id === activeId);
        try { assertStudyAiSourcesAllowed(current?.materials.map(m => m.source.sourceEntryId) ?? []); }
        catch {
            const epoch = ++generation.current;
            controller.current?.abort(); lock.current = false;
            queueMicrotask(() => { if (epoch === generation.current) setScopeBusy(false); });
        }
    }, [session, activeId, protection]);
    useEffect(() => () => setStudyAiSession(null), []);
    const blockedIds = protection.sourceIds;
    const available = useMemo(() => protection.unavailable ? [] : entries.filter(e => !blockedIds.has(e.id)).flatMap(entryAiMaterials).filter(material => !blockedIds.has(material.source.sourceEntryId)), [entries, blockedIds, protection.unavailable]);
    const currentMaterials = useMemo(() => {
        if (session) {
            if ((session.mode === "real" && session.status === "in_progress") || protection.unavailable)
                return [];
            const q = session.questions[session.currentQuestionIndex];
            if (!q)
                return [];
            if (blockedIds.has(q.sourceReference?.sourceEntryId ?? q.sourceEntryId ?? session.entryId)) return [];
            return [{ id: `session:${session.id}:${q.id}`, source: q.sourceReference ?? { sourceEntryId: q.sourceEntryId ?? session.entryId, sourceEntryTitle: session.title, sourceQuestionNumber: q.sourceQuestionNumber ?? q.questionNumber, sourceStatus: "snapshot_only" as const }, snapshot: structuredClone(q), groupMemberIds: q.stimulusGroupId ? session.questions.filter(other => other.stimulusGroupId === q.stimulusGroupId).map(other => `session:${session.id}:${other.id}`) : undefined, units: [] }] satisfies AiMaterial[];
        }
        if (!selectedEntryId)
            return [];
        const choices = available.filter(m => m.source.sourceEntryId === selectedEntryId);
        const number = selection?.entryId === selectedEntryId ? selection.questionNumber : undefined;
        return number ? choices.filter(m => normalizeQuestionNumber(m.source.sourceQuestionNumber) === normalizeQuestionNumber(number)) : choices.length === 1 ? choices : [];
    }, [session, selectedEntryId, available, selection, blockedIds, protection.unavailable]);
    const reload = async (allowDiscard = false) => {
        if (lock.current || reloadLock.current || maintenance) return;
        reloadLock.current = true;
        const epoch = ++generation.current;
        try {
            if (hasPendingAiStudyWrites() && (!allowDiscard || !(await confirm({ title: "저장된 기록으로 돌아가기", message: "기기에 저장하지 못한 대화가 있습니다. 저장 재시도로 보존할 수 있습니다. 미저장 변경을 버리고 마지막 저장본을 불러올까요?" })))) {
                setSaveError("미저장 기록을 보존했습니다. 저장 재시도를 먼저 실행하세요.");
                return;
            }
            setLoading(true);
            const next = await loadAiStudyStore();
            if (epoch !== generation.current)
                return;
            if (allowDiscard) discardPendingAiStudyWrites();
            persistedIds.current = new Set(next.conversations.map(c => c.id));
            storeRef.current = next;
            setStore(next);
            setLoaded(true);
            setActiveId(id => next.conversations.some(c => c.id === id) ? id : next.conversations[0]?.id ?? "");
            setSaveError("");
            setError("");
            pendingSend.current = null;
        }
        catch (e) {
            if (epoch === generation.current) {
                setLoaded(false);
                setError(e instanceof Error ? e.message : "대화 불러오기 실패");
            }
        }
        finally {
            if (epoch === generation.current) {
                setLoading(false);
                reloadLock.current = false;
            }
        }
    };
    useEffect(() => {
        void reload();
        const handle = (event: Event) => {
            const blocked = (event as CustomEvent<boolean>).detail;
            setMaintenance(blocked);
            if (blocked) {
                generation.current++;
                reloadLock.current = false;
                controller.current?.abort();
                setBusy(false);
                setScopeBusy(false);
                lock.current = false;
            }
            else if (!hasPendingAiStudyWrites())
                void reload();
        };
        window.addEventListener("ai-study-maintenance", handle);
        return () => { generation.current++; reloadLock.current = false; controller.current?.abort(); window.removeEventListener("ai-study-maintenance", handle); };
    }, []);
    useEffect(() => {
        if (open)
            inputRef.current?.focus();
    }, [open]);
    useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight }); }, [active?.messages]);
    const updateConversation = async (next: AiConversation) => {
        storeRef.current = { ...storeRef.current, conversations: [next, ...storeRef.current.conversations.filter(c => c.id !== next.id)] };
        setStore(storeRef.current);
        try {
            await saveAiConversation(next, !persistedIds.current.has(next.id));
            persistedIds.current.add(next.id);
            if (!hasPendingAiStudyWrites()) setSaveError("");
        }
        catch (e) {
            setSaveError(e instanceof Error ? e.message : "대화 저장 실패");
            throw e;
        }
    };
    const retrySave = async () => {
        if (lock.current || maintenance) return;
        const epoch = generation.current;
        lock.current = true;
        try {
            await flushAiStudyWrites(); const saved = await loadAiStudyStore();
            if (epoch !== generation.current) return;
            persistedIds.current = new Set(saved.conversations.map(c => c.id)); storeRef.current = saved; setStore(saved);
            setActiveId(id => saved.conversations.some(c => c.id === id) ? id : saved.conversations[0]?.id ?? "");
            setSaveError(""); setError(""); setLoaded(true); setLoading(false);
        }
        catch (e) { setSaveError(e instanceof Error ? e.message : "대화 저장 실패"); }
        finally { lock.current = false; }
    };
    const run = (task: Promise<unknown>) => { void task.catch(e => setError(e instanceof Error ? e.message : String(e))); };
    const startNew = async () => {
        if (lock.current || reloadLock.current || !loaded || loading || maintenance)
            return;
        lock.current = true;
        try {
            const next = newConversation();
            setActiveId(next.id);
            await updateConversation(next);
            setInput(""); setError(""); setScopeNotice("");
        } finally { lock.current = false; }
    };
    const changeScope = async (materials: AiMaterial[], sharing: AiSharing) => {
        if (lock.current || reloadLock.current || maintenance || !loaded)
            return;
        const epoch = generation.current;
        lock.current = true;setScopeBusy(true);
        try {
            if (sharing.images && !(storeRef.current.conversations.find(c => c.id === activeId)?.sharing.images) && !(await confirm({ title: "그림 입력 지원 확인", message: "연결한 모델이 그림 입력을 지원하는지 확인하세요. 그림을 API로 전송할까요?" })))
                return;
            if ((sharing.answers || sharing.explanations) && !(await confirm({ title: "정답·해설 공유 허용", message: "선택한 문항의 정답·해설을 API 제공자에게 전송하도록 허용할까요?" })))
                return;
            if (epoch !== generation.current)
                return;
            assertStudyAiSourcesAllowed(materials.map(m => m.source.sourceEntryId));
            const current = storeRef.current.conversations.find(c => c.id === activeId) ?? newConversation();
            const next = changeAiScope(current, materials, sharing);
            await updateConversation(next);
            setActiveId(next.id);
            setScopeNotice("전송 범위가 바뀌어 새 문맥으로 시작합니다. 이전 대화는 기록에 남고 다시 전송되지 않습니다. 이미 전송한 자료는 회수할 수 없습니다.");
        }
        finally {
            if (epoch === generation.current) { lock.current = false;setScopeBusy(false); }
        }
    };
    const send = async (text = input, retry?: { conversationId: string; contextId: string; messageId: string }) => {
        if (lock.current || reloadLock.current || !loaded || loading || maintenance || !text.trim())
            return;
        lock.current = true;
        setBusy(true);
        setError("");
        const abort = new AbortController();
        controller.current = abort;
        const epoch = generation.current;
        let c = storeRef.current.conversations.find(c => c.id === activeId) ?? newConversation();
        const pending = pendingSend.current;
        const target = retry ?? (pending?.conversationId === c.id && pending.contextId === c.contextId && pending.text === text.trim() ? pending : undefined);
        const assistantId = crypto.randomUUID();
        let accumulated = "";
        try {
            if (hasPendingAiStudyWrites()) throw new Error("미저장 기록의 저장 재시도를 먼저 실행하세요.");
            assertStudyAiSourcesAllowed(c.materials.map(m => m.source.sourceEntryId));
            const context = buildAiContext(c.materials, c.sharing);
            let messages: ReturnType<typeof activeContextMessages>;
            if (target) {
                if (target.conversationId !== c.id || target.contextId !== c.contextId) throw new Error("문맥이 변경되어 이전 질문을 재전송하지 않았습니다.");
                messages = retryContextMessages(c, target.messageId);
            } else {
                const messageId = crypto.randomUUID();
                pendingSend.current = { conversationId: c.id, contextId: c.contextId, messageId, text: text.trim() };
                c = { ...c, title: c.messages.length ? c.title : text.trim().slice(0, 36), updatedAt: new Date().toISOString(), messages: [...c.messages, { id: messageId, role: "user", text: text.trim(), contextId: c.contextId, status: "complete" }] };
                messages = activeContextMessages(c);
            }
            if (messages.length > 60) throw new Error("대화가 길어졌습니다. 새 대화로 시작하세요.");
            c = { ...c, messages: [...c.messages, { id: assistantId, role: "assistant", text: "", contextId: c.contextId, status: "stopped" }] };
            setActiveId(c.id);
            await updateConversation(c);
            if (epoch !== generation.current)
                return;
            assertStudyAiSourcesAllowed(c.materials.map(m => m.source.sourceEntryId));
            if (abort.signal.aborted) throw new DOMException("취소했습니다.", "AbortError");
            setInput("");
            pendingSend.current = null;
            const response = await requestStudyAi({ context: context.text, images: context.images, messages, sourceEntryIds: c.materials.map(m => m.source.sourceEntryId) }, abort.signal, delta => {
                if (epoch !== generation.current || abort.signal.aborted)
                    return;
                accumulated += delta;
                const next = { ...c, messages: c.messages.map(m => m.id === assistantId ? { ...m, text: accumulated } : m) };
                storeRef.current = { ...storeRef.current, conversations: [next, ...storeRef.current.conversations.filter(v => v.id !== next.id)] };
                setStore(storeRef.current);
            });
            if (epoch !== generation.current)
                return;
            if (abort.signal.aborted) throw new DOMException("취소했습니다.", "AbortError");
            assertStudyAiSourcesAllowed(c.materials.map(m => m.source.sourceEntryId));
            await updateConversation({ ...c, messages: c.messages.map(m => m.id === assistantId ? { ...m, text: response, status: "complete" } : m) });
        }
        catch (e) {
            if (epoch !== generation.current)
                return;
            if (!hasPendingAiStudyWrites() && c.messages.some(m => m.id === assistantId)) {
                try {
                    await updateConversation({ ...c, messages: c.messages.map(m => m.id === assistantId ? { ...m, text: accumulated || (abort.signal.aborted ? "응답을 중지했습니다." : "응답에 실패했습니다."), status: abort.signal.aborted ? "stopped" : "failed" } : m) });
                }
                catch { /* The persistent save error remains visible with retry. */ }
            }
            if (!abort.signal.aborted)
                setError(e instanceof Error ? e.message : "AI 요청 실패");
        }
        finally {
            if (controller.current === abort) {
                setBusy(false);
                lock.current = false;
                controller.current = null;
            }
        }
    };
    const close = () => { setOpen(false); launcher.current?.focus(); };
    const panel = open && <aside ref={panelRef} tabIndex={-1} role="dialog" aria-label="AI 학습 대화" aria-modal={compact} className="study-ai-panel" onKeyDown={e => {
            if (e.key === "Escape") {
                e.stopPropagation();
                close();
            }
            else if (["ArrowLeft", "ArrowRight"].includes(e.key))
                e.stopPropagation();
        }}>
    <header><h2>AI 학습 대화</h2><button type="button" onClick={() => { close(); onSettings(); }}>API 설정</button><button aria-label="AI 대화 닫기" onClick={close}>✕</button></header>
    <div className="ai-context-summary">AI가 볼 자료: {active?.materials.length ?? 0}문항 · {Object.entries(active?.sharing ?? DEFAULT_AI_SHARING).filter(([, value]) => value).map(([key]) => SHARING_LABELS[key as keyof AiSharing]).join(" / ")}{realActive && <p>진행 중 실전 시험의 자료는 첨부할 수 없습니다.</p>}</div>
    <div className="ai-chat-controls">
    <div className="ai-conversation-tools"><select aria-label="대화 기록" value={activeId} disabled={busy || loading || maintenance} onChange={e => { setActiveId(e.target.value); setError(""); setInput(""); setScopeNotice(""); }}><option value="">자료 없는 새 대화</option>{store.conversations.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select><button disabled={busy || loading || maintenance} onClick={() => run(startNew())}>새 대화</button>
    <details className="ai-conversation-management"><summary>대화 관리</summary><div className="ai-inline-actions">{active && <><button disabled={busy || maintenance} onClick={() => run((async () => {
                if (lock.current || reloadLock.current || !loaded) return;
                const epoch = generation.current; lock.current = true;
                try {
                    const name = await prompt({ title: "대화 이름", message: "대화 이름을 입력하세요.", defaultValue: active.title });
                    const latest = storeRef.current.conversations.find(c => c.id === active.id);
                    if (epoch === generation.current && name?.trim() && latest) await updateConversation({ ...latest, title: name.trim() });
                } finally { if (epoch === generation.current) lock.current = false; }
            })())}>이름 변경</button><button disabled={busy || maintenance} onClick={() => run((async () => {
                if (lock.current || reloadLock.current || !loaded) return;
                const epoch = generation.current; lock.current = true;
                try {
                    if (await confirm({ title: "대화 삭제", message: "이 기기의 대화와 첨부 기록을 삭제할까요?" })) {
                        if (epoch !== generation.current) return;
                        await deleteAiConversation(active.id);
                        if (epoch !== generation.current) return;
                        const next = { ...storeRef.current, conversations: storeRef.current.conversations.filter(c => c.id !== active.id), drafts: storeRef.current.drafts?.filter(d => d.id !== `conversation:${active.id}`) };
                        persistedIds.current.delete(active.id); storeRef.current = next; setStore(next); setActiveId("");
                    }
                } finally { if (epoch === generation.current) lock.current = false; }
            })())}>삭제</button></>}</div>
    <label><input type="checkbox" checked={includeBackup} disabled={busy || maintenance} onChange={e => {
                try {
                    localStorage.setItem(AI_BACKUP_PREFERENCE_KEY, String(e.target.checked));
                    setIncludeBackup(e.target.checked);
                }
                catch {
                    setError("백업 포함 설정을 저장하지 못했습니다.");
                }
            }}/>수동 백업에 대화·첨부 자료 포함</label></details></div>
    <AiMaterialPicker available={available} selected={active?.materials ?? []} sharing={active?.sharing ?? DEFAULT_AI_SHARING} disabled={busy || scopeBusy || !loaded || maintenance} onChange={(m, s) => run(changeScope(m, s))}/>
    <div className="ai-inline-actions"><button disabled={busy || maintenance || !currentMaterials.length} onClick={() => run(changeScope([...new Map([...(active?.materials ?? []), ...currentMaterials].map(m => [m.id, m])).values()], active?.sharing ?? DEFAULT_AI_SHARING))}>현재 문항 추가</button><button disabled={busy || maintenance || !selection?.selectedNumbers.length || selection.entryId !== selectedEntryId} onClick={() => run(changeScope([...new Map([...(active?.materials ?? []), ...available.filter(m => m.source.sourceEntryId === selection?.entryId && selection.selectedNumbers.map(normalizeQuestionNumber).includes(normalizeQuestionNumber(m.source.sourceQuestionNumber)))].map(m => [m.id, m])).values()], active?.sharing ?? DEFAULT_AI_SHARING))}>선택 문항 추가</button></div>
    </div>
    <div className="ai-messages" ref={scroll} aria-live="polite">
    {loading && <p>대화 불러오는 중…</p>}
    {scopeNotice && <p className="ai-scope-notice" role="status">{scopeNotice}</p>}
    {!loading && !active?.messages.length && <p>자유롭게 대화하세요. 문제를 함께 보려면 먼저 자료를 추가하세요.</p>}{active?.messages.map(m => <article key={m.id} className={`ai-message ai-message--${m.role}`}><strong>{m.role === "user" ? "나" : "AI"}</strong>{m.contextId !== active.contextId && <small>이전 문맥 · 재전송하지 않음</small>}<AiMessageContent text={(protection.unavailable || blockedIds.size > 0) && [...(active?.materials ?? []), ...(active?.contexts?.find(ctx => ctx.id === m.contextId)?.materials ?? [])].some(material => protection.unavailable || blockedIds.has(material.source.sourceEntryId)) ? "진행 중 실전 시험에 연결된 이전 대화는 제출 후 확인할 수 있습니다." : m.text}/>{busy && m.role === "assistant" && m.id === active?.messages.at(-1)?.id ? <small>응답 생성 중…</small> : m.status === "failed" || m.status === "stopped" ? <small>{m.status === "failed" ? "실패" : "중지"} · 다음 요청에 포함하지 않음</small> : null}</article>)}
    {active?.materials.length ? <div className="ai-composition-card"><strong>첨부한 문제로 모의고사 구성</strong><p>조건과 선정 이유를 검토한 뒤 저장합니다.</p><button disabled={busy || maintenance || active.materials.some(m => blockedIds.has(m.source.sourceEntryId))} onClick={() => { setComposer(true); setOpen(false); }}>{active.proposal?.status==="ready"?"저장한 구성 다시 보기":"AI 구성안 만들기"}{active.proposal && active.proposal.status!=="ready" ? " · 초안 이어서" : ""}</button></div> : null}
    </div>
    <footer className="ai-chat-footer">
    <div className="ai-chat-errors">{error && <div role="alert" className="form-error">{error}<button disabled={busy || maintenance} onClick={() => run(reload(true))}>기록 다시 불러오기</button></div>}{saveError && <div role="alert" className="form-error">기기에 저장하지 못했습니다: {saveError}<button disabled={busy || maintenance} onClick={() => run(retrySave())}>저장 재시도</button><button disabled={busy || maintenance} onClick={() => run(reload(true))}>저장본으로 돌아가기</button></div>}</div>
    <form onSubmit={e => { e.preventDefault(); void send(); }}><label>메시지<textarea ref={inputRef} value={input} disabled={maintenance} onChange={e => setInput(e.target.value)} onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send();
                }
            }}/></label><div className="ai-inline-actions">{busy ? <button type="button" onClick={() => controller.current?.abort()}>응답 중지</button> : <button type="submit" disabled={scopeBusy || !loaded || maintenance || !input.trim()}>전송</button>}<button type="button" disabled={busy || scopeBusy || maintenance || !active || !retryableUserMessage(active)} onClick={() => {
                const last = active && retryableUserMessage(active);
                if (last)
                    void send(last.text, { conversationId: active!.id, contextId: active!.contextId, messageId: last.id });
            }}>마지막 질문 재시도</button></div></form><small>API 사용 요금은 연결한 제공자 계정에 청구됩니다. 대화 기록은 이 기기에 보관합니다.</small></footer>
  </aside>;
    return <>{createPortal(<><button ref={launcher} type="button" className="study-ai-launcher" aria-label="AI 학습 대화 열기" aria-expanded={open} onClick={() => setOpen(v => !v)}>AI</button>{panel}</>, document.body)}{composer && active && <AiExamComposer draftId={`conversation:${active.id}`} entries={entries.filter(e => !blockedIds.has(e.id))} initialMaterials={active.materials} initialProposal={active.proposal} onProposal={async (exam) => { await updateConversation({ ...storeRef.current.conversations.find(c => c.id === active.id)!, proposal: exam }); }} onClose={() => { setComposer(false); setOpen(true); }} onSave={onSaveExam} onStart={async exam=>{await onStartExam(exam);setComposer(false);setOpen(false);}}/>}</>;
}
