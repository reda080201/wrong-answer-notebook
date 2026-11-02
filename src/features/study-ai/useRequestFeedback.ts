import { useCallback, useEffect, useState } from "react";

export type RequestPhase = "idle" | "saving-question" | "waiting" | "receiving" | "saving-result";
export const REQUEST_PHASE_LABELS: Record<RequestPhase, string> = {
  idle: "", "saving-question": "기록 저장 중", waiting: "응답 대기 중", receiving: "응답 수신 중", "saving-result": "결과 저장 중",
};

/** Feedback only: authorization, cancellation and persistence stay at the request boundary. */
export function useRequestFeedback() {
  const [phase, setPhase] = useState<RequestPhase>("idle");
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (phase !== "waiting") return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);
  const update = useCallback((next: RequestPhase) => { setElapsed(0); setPhase(next); }, []);
  return { phase, elapsed, update };
}
