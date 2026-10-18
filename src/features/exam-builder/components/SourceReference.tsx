import { useContext, useState } from "react";
import type { QuestionSourceReference } from "../../../types";
import { formatQuestionSourceLabel } from "../services/questionSource";
import { SourceNavigationContext } from "./sourceNavigationContext";

export default function SourceReference({ source, onBeforeNavigate }: {
  source?: QuestionSourceReference;
  onBeforeNavigate?(): Promise<void> | void;
}) {
  const navigate = useContext(SourceNavigationContext);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!source) return null;
  const open = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onBeforeNavigate?.();
      await navigate?.(source);
    } catch (e) {
      setError(e instanceof Error ? e.message : "원본 이동에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };
  // The paper's focus handler must not replace this button before its click arrives.
  return <div className="question-source-reference" onFocus={event => event.stopPropagation()}>
    {navigate ? <button type="button" disabled={busy} onClick={() => void open()}>{formatQuestionSourceLabel(source)}</button> : <span>{formatQuestionSourceLabel(source)}</span>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
