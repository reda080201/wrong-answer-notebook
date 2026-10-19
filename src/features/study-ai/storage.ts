import { invoke, isTauri } from "@tauri-apps/api/core";
import { AI_STUDY_STORAGE_KEY, emptyAiStudyStore, isAiStudyStore, type AiConversation, type AiExamDraft, type AiStudyStore } from "./model";
import { getStorageBackendKind } from "../../services/storageBackend";
let queue: Promise<void> = Promise.resolve();
let blocked = false;
let lastWrite: Promise<void> = queue;
let revision = 0;
const pending = new Map<string, { conversation: AiConversation; create: boolean; revision: number }>();
const createdHere = new Set<string>();
const deletedHere = new Set<string>();
export function setAiStudyMaintenanceBlocked(value: boolean) {
    if (blocked && !value) { createdHere.clear(); deletedHere.clear(); }
    blocked = value;
    window.dispatchEvent(new CustomEvent("ai-study-maintenance", { detail: value }));
}
export function hasPendingAiStudyWrites() { return pending.size > 0; }
export function discardPendingAiStudyWrites() { pending.clear(); lastWrite = queue; }
export async function flushAiStudyWrites() {
    await queue;
    for (const operation of [...pending.values()]) await persistConversation(operation, true);
    await lastWrite;
}
async function readStore(): Promise<AiStudyStore> {
    const value: unknown = isTauri() ? await invoke("load_ai_study_store") : getStorageBackendKind() === "desktop-proxy" ? (() => { throw new Error("AI 대화 기록은 설치 앱에서 사용하세요."); })() : JSON.parse(localStorage.getItem(AI_STUDY_STORAGE_KEY) ?? JSON.stringify(emptyAiStudyStore()));
    if (!isAiStudyStore(value))
        throw new Error("AI 대화 기록 형식이 잘못되었습니다. 기존 기록을 보존했습니다.");
    return value;
}
export async function loadAiStudyStore(): Promise<AiStudyStore> { await queue; return readStore(); }
async function writeStore(store: AiStudyStore): Promise<void> {
    if (!isAiStudyStore(store))
        throw new Error("AI 대화·구성 초안 형식이 잘못되었습니다.");
    if (new TextEncoder().encode(JSON.stringify(store)).length > 16 * 1024 * 1024)
        throw new Error("AI 기록이 16MiB를 넘습니다. 오래된 대화를 삭제하세요.");
    if (isTauri())
        await invoke("save_ai_study_store", { store });
    else if (getStorageBackendKind() === "desktop-proxy")
        throw new Error("AI 기록은 설치 앱에서 사용하세요.");
    else
        localStorage.setItem(AI_STUDY_STORAGE_KEY, JSON.stringify(store));
}
function enqueue(update: (current: AiStudyStore) => AiStudyStore, recovery = false): Promise<void> {
    if (blocked && !recovery)
        return Promise.reject(new Error("백업·복원 중에는 AI 기록 저장을 기다려 주세요."));
    const task = queue.then(async () => writeStore(update(await readStore())));
    lastWrite = task;
    queue = task.catch(() => undefined);
    return task;
}
async function persistConversation(operation: { conversation: AiConversation; create: boolean; revision: number }, recovery = false): Promise<void> {
    const { conversation, create } = operation;
    await enqueue(current => {
        const existing = current.conversations.find(c => c.id === conversation.id);
        if (deletedHere.has(conversation.id)) throw new Error("삭제된 대화는 다시 저장할 수 없습니다. 기록을 다시 불러오세요.");
        if (!existing && !create) throw new Error("삭제된 대화는 다시 저장할 수 없습니다. 기록을 다시 불러오세요.");
        if (existing && create && !createdHere.has(conversation.id) && JSON.stringify(existing) !== JSON.stringify(conversation)) throw new Error("같은 ID의 다른 대화가 있습니다. 기존 기록을 보존했습니다.");
        return { ...current, conversations: [conversation, ...current.conversations.filter(c => c.id !== conversation.id)] };
    }, recovery);
    if (create) createdHere.add(conversation.id);
    if (pending.get(conversation.id)?.revision === operation.revision) pending.delete(conversation.id);
    window.dispatchEvent(new Event("ai-study-saved"));
}
/** Failed writes remain recoverable in memory; flushing them is part of maintenance. */
export function saveAiConversation(conversation: AiConversation, create = false): Promise<void> {
    if (blocked) return Promise.reject(new Error("백업·복원 중에는 AI 기록 저장을 기다려 주세요."));
    if (deletedHere.has(conversation.id)) return Promise.reject(new Error("삭제된 대화는 다시 저장할 수 없습니다. 기록을 다시 불러오세요."));
    const previous = pending.get(conversation.id);
    const operation = { conversation: structuredClone(conversation), create: previous?.create ?? create, revision: ++revision };
    pending.set(conversation.id, operation);
    return persistConversation(operation);
}
export function deleteAiConversation(id: string): Promise<void> {
    if (pending.size) return Promise.reject(new Error("미저장 대화를 먼저 저장한 뒤 삭제하세요."));
    return enqueue(current => ({ ...current,
        conversations: current.conversations.filter(c => c.id !== id),
        drafts: (current.drafts ?? []).filter(d => d.id !== `conversation:${id}`),
    })).then(() => { deletedHere.add(id); createdHere.delete(id); });
}
/** Chat and composer writes merge under the same queue so neither drops the other's records. */
export function saveAiStudyStore(store: AiStudyStore): Promise<void> {
    if (!isAiStudyStore(store))
        return Promise.reject(new Error("AI 기록 형식이 잘못되었습니다."));
    const snapshot = structuredClone(store);
    return enqueue(current => ({ ...current, conversations: snapshot.conversations }));
}
export function saveAiExamDraft(draft: AiExamDraft): Promise<void> {
    const snapshot = structuredClone(draft);
    return enqueue(current => {
        if (snapshot.id.startsWith("conversation:") && !current.conversations.some(c => `conversation:${c.id}` === snapshot.id)) throw new Error("삭제된 대화의 구성 초안은 저장할 수 없습니다.");
        return { ...current, drafts: [snapshot, ...(current.drafts ?? []).filter(d => d.id !== snapshot.id)] };
    });
}
export function clearAiExamDraft(id: string): Promise<void> { return enqueue(current => ({ ...current, drafts: (current.drafts ?? []).filter(d => d.id !== id) })); }
