import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ConceptIndexItem } from "../utils/conceptIndex";
import { buildConceptIndex } from "../utils/conceptIndex";
import type { ViewPreferences, WrongAnswerEntry } from "../../../types";
import MathText from "../../../components/MathText";
import Dialog from "../../../shared/ui/Dialog";

export interface ConceptLinkRuntime {
  enabled: boolean;
  automaticEnabled: boolean;
  resolve: (target: string) => ConceptIndexItem | undefined;
  open: (item: ConceptIndexItem) => void;
  aliases: string[];
}

const ConceptLinkContext = createContext<ConceptLinkRuntime | null>(null);

export function useConceptLinkRuntime() {
  return useContext(ConceptLinkContext);
}

interface Props {
  entries: WrongAnswerEntry[];
  preferences: ViewPreferences;
  onOpenEntry: (entryId: string) => void;
  onOpenLearningBlock: (entryId: string, blockId: string) => void;
  children: ReactNode;
}

export default function ConceptLinkProvider({ entries, preferences, onOpenEntry, onOpenLearningBlock, children }: Props) {
  const index = useMemo(() => buildConceptIndex(entries), [entries]);
  const [active, setActive] = useState<ConceptIndexItem | null>(null);
  const runtime = useMemo<ConceptLinkRuntime>(() => ({
    enabled: preferences.conceptLinksEnabled !== false,
    automaticEnabled: preferences.conceptLinksEnabled !== false && Boolean(preferences.automaticConceptLinksEnabled),
    resolve: (target) => index.get(target.trim().toLocaleLowerCase("ko-KR")),
    open: setActive,
    aliases: [...index.keys()].sort((left, right) => right.length - left.length || left.localeCompare(right, "ko")),
  }), [index, preferences.automaticConceptLinksEnabled, preferences.conceptLinksEnabled]);
  const block = active?.block;

  return <ConceptLinkContext.Provider value={runtime}>
    {children}
    <Dialog open={Boolean(active)} onClose={() => setActive(null)} ariaLabel={active ? `${active.title} 개념 미리보기` : "개념 미리보기"} closeOnBackdrop>
      {active && <aside className="concept-link-popover">
      <header><strong>{active.title}</strong><button type="button" aria-label="개념 미리보기 닫기" onClick={() => setActive(null)}>✕</button></header>
      {block?.content ? <div><MathText text={block.content} /></div> : active.sourceEntry.question.trim() ? <div><MathText text={active.sourceEntry.question} /></div> : <p>저장된 개념 설명이 없습니다.</p>}
      {block?.subjectMetadata?.subject === "math" && block.subjectMetadata.formulaLatex?.length ? <section><strong>공식</strong><ul>{block.subjectMetadata.formulaLatex.map((formula) => <li key={formula}><MathText text={formula} /></li>)}</ul></section> : null}
      {block?.subjectMetadata?.subject === "life_ethics" && block.subjectMetadata.keyClaims?.length ? <section><strong>판별 기준</strong><ul>{block.subjectMetadata.keyClaims.map((claim) => <li key={claim}>{claim}</li>)}</ul></section> : null}
      {block?.commonTraps?.length ? <section><strong>주의할 점</strong><ul>{block.commonTraps.map((trap) => <li key={trap}>{trap}</li>)}</ul></section> : null}
      {block?.relatedConcepts?.length ? <p>관련 개념: {block.relatedConcepts.join(" · ")}</p> : null}
      <footer><button type="button" onClick={() => { setActive(null); onOpenEntry(active.sourceEntry.id); }}>원본 항목 열기</button>{block ? <button type="button" onClick={() => { setActive(null); onOpenLearningBlock(active.sourceEntry.id, block.id); }}>학습 카드 열기</button> : null}</footer>
      </aside>}
    </Dialog>
  </ConceptLinkContext.Provider>;
}
