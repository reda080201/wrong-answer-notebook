import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
export interface StudyAiRequest {
    messages: Array<{
        role: "user" | "assistant";
        text: string;
    }>;
    context: string;
    images: string[];
    json?: boolean;
}
export async function requestStudyAi(request: StudyAiRequest, signal: AbortSignal, onDelta?: (text: string) => void): Promise<string> {
    if (!isTauri())
        throw new Error("AI 대화·구성은 설치 앱의 AI 설정에서 제공자와 API 키를 연결한 뒤 사용할 수 있습니다.");
    if (signal.aborted)
        throw new DOMException("취소했습니다.", "AbortError");
    const requestId = crypto.randomUUID();
    const channel = new Channel<string>();
    channel.onmessage = text => {
        if (!signal.aborted)
            onDelta?.(text);
    };
    const cancel = () => { void invoke("cancel_study_ai", { requestId }).catch(() => undefined); };
    signal.addEventListener("abort", cancel, { once: true });
    try {
        const response = await invoke<string>("request_study_ai", { requestId, request, onDelta: channel });
        if (signal.aborted)
            throw new DOMException("취소했습니다.", "AbortError");
        return response;
    }
    finally {
        signal.removeEventListener("abort", cancel);
    }
}
