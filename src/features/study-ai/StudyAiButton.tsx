const OPEN_STUDY_AI = "study-ai:open";

export function listenForStudyAiOpen(onOpen: (opener: HTMLButtonElement) => void) {
  const listener = (event: Event) => {
    const opener = (event as CustomEvent<unknown>).detail;
    if (opener instanceof HTMLButtonElement) onOpen(opener);
  };
  window.addEventListener(OPEN_STUDY_AI, listener);
  return () => window.removeEventListener(OPEN_STUDY_AI, listener);
}

export default function StudyAiButton() {
  return <button type="button" className="btn-secondary btn-sm" onClick={event => {
    window.dispatchEvent(new CustomEvent(OPEN_STUDY_AI, { detail: event.currentTarget }));
  }}>AI 대화</button>;
}
