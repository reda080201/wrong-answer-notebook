import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { assertStudyAiSourcesAllowed, watchStudyAiPolicy } from "./requestPolicy";
export interface StudyAiRequest {
    messages: Array<{
        role: "user" | "assistant";
        text: string;
    }>;
    context: string;
    images: string[];
    json?: boolean;
    /** Local authorization metadata, never sent to the provider. */
    sourceEntryIds?: string[];
}
export async function requestStudyAi(request: StudyAiRequest, signal: AbortSignal, onDelta?: (text: string) => void): Promise<string> {
    if (!isTauri())
        throw new Error("AI 대화·구성은 설치 앱의 AI 설정에서 제공자와 API 키를 연결한 뒤 사용할 수 있습니다.");
    if (signal.aborted)
        throw new DOMException("취소했습니다.", "AbortError");
    const sourceIds = request.sourceEntryIds ?? [];
    if (request.context !== "[]" && !request.sourceEntryIds) throw new Error("전송 자료의 출처를 확인할 수 없습니다.");
    assertStudyAiSourcesAllowed(sourceIds);
    const requestId = crypto.randomUUID();
    const channel = new Channel<string>();
    let policyCancelled = false;
    channel.onmessage = text => {
        if (!signal.aborted && !policyCancelled)
            onDelta?.(text);
    };
    const cancel = () => { void invoke("cancel_study_ai", { requestId }).catch(() => undefined); };
    const unwatch = watchStudyAiPolicy(() => {
        try { assertStudyAiSourcesAllowed(sourceIds); } catch { policyCancelled = true; cancel(); }
    });
    signal.addEventListener("abort", cancel, { once: true });
    try {
        const payload = { messages: request.messages, context: request.context, images: request.images, ...(request.json !== undefined ? { json: request.json } : {}) };
        const response = await invoke<string>("request_study_ai", { requestId, request: payload, onDelta: channel });
        if (signal.aborted || policyCancelled)
            throw new DOMException("취소했습니다.", "AbortError");
        return response;
    }
    finally {
        signal.removeEventListener("abort", cancel);
        unwatch();
    }
}
