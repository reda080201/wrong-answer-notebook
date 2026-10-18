import { invoke, isTauri } from "@tauri-apps/api/core";
import { AI_STUDY_STORAGE_KEY, emptyAiStudyStore, isAiStudyStore, type AiExamDraft, type AiStudyStore } from "./model";
import { getStorageBackendKind } from "../../services/storageBackend";
let queue: Promise<void> = Promise.resolve();
let blocked = false;
let lastWrite: Promise<void> = queue;
export function setAiStudyMaintenanceBlocked(value: boolean) { blocked = value; window.dispatchEvent(new CustomEvent("ai-study-maintenance", { detail: value })); }
export function flushAiStudyWrites() { return lastWrite; }
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
function enqueue(update: (current: AiStudyStore) => AiStudyStore): Promise<void> {
    if (blocked)
        return Promise.reject(new Error("백업·복원 중에는 AI 기록 저장을 기다려 주세요."));
    const task = queue.then(async () => writeStore(update(await readStore())));
    lastWrite = task;
    queue = task.catch(() => undefined);
    return task;
}
/** Chat and composer writes merge under the same queue so neither drops the other's records. */
export function saveAiStudyStore(store: AiStudyStore): Promise<void> {
    if (!isAiStudyStore(store))
        return Promise.reject(new Error("AI 기록 형식이 잘못되었습니다."));
    const snapshot = structuredClone(store);
    return enqueue(current => ({ ...current, conversations: snapshot.conversations }));
}
export function saveAiExamDraft(draft: AiExamDraft): Promise<void> { const snapshot = structuredClone(draft); return enqueue(current => ({ ...current, drafts: [snapshot, ...(current.drafts ?? []).filter(d => d.id !== snapshot.id)] })); }
export function clearAiExamDraft(id: string): Promise<void> { return enqueue(current => ({ ...current, drafts: (current.drafts ?? []).filter(d => d.id !== id) })); }
