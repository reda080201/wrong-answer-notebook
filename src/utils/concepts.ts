import type { WrongAnswerEntry } from "../types";

const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;

export interface ConceptGraphNode {
  id: string;
  label: string;
  entryId?: string;
  kind: "entry" | "concept";
}

export interface ConceptGraphEdge {
  from: string;
  to: string;
  weight?: number;
}

export interface ConceptGraph {
  nodes: ConceptGraphNode[];
  edges: ConceptGraphEdge[];
}

export function extractConceptLinks(text: string): string[] {
  const links = new Set<string>();
  for (const match of text.matchAll(WIKI_LINK_RE)) {
    const label = match[1]?.trim();
    if (label) links.add(label);
  }
  return [...links];
}

export function getEntryConceptLinks(entry: WrongAnswerEntry): string[] {
  return [
    ...new Set([
      ...extractConceptLinks(entry.question),
      ...extractConceptLinks(entry.myAnswer),
      ...extractConceptLinks(entry.correctAnswer),
      ...entry.explanationParts.flatMap((part) => extractConceptLinks(part.text)),
      ...extractConceptLinks(entry.memo),
      ...(entry.answerKey ?? []).flatMap((item) => [
        ...(item.concepts ?? []),
        ...extractConceptLinks(item.explanation),
        ...extractConceptLinks(item.notes ?? ""),
        ...item.importantPoints.flatMap(extractConceptLinks),
      ]),
    ]),
  ];
}

function addWeightedEdge(edges: ConceptGraphEdge[], from: string, to: string) {
  const existing = edges.find((edge) => edge.from === from && edge.to === to);
  if (existing) {
    existing.weight = (existing.weight ?? 1) + 1;
  } else {
    edges.push({ from, to, weight: 1 });
  }
}

export function buildConceptGraph(entries: WrongAnswerEntry[]): ConceptGraph {
  const nodes = new Map<string, ConceptGraphNode>();
  const edges: ConceptGraphEdge[] = [];

  for (const entry of entries) {
    nodes.set(entry.id, {
      id: entry.id,
      label: entry.title.trim() || entry.question.trim().slice(0, 20) || "(제목 없음)",
      entryId: entry.id,
      kind: entry.entryKind === "concept" ? "concept" : "entry",
    });

    for (const link of getEntryConceptLinks(entry)) {
      const conceptId = `concept:${link.toLowerCase()}`;
      if (!nodes.has(conceptId)) {
        const matching = entries.find(
          (candidate) =>
            candidate.entryKind === "concept" &&
            candidate.title.trim().toLowerCase() === link.toLowerCase(),
        );
        nodes.set(conceptId, {
          id: conceptId,
          label: link,
          entryId: matching?.id,
          kind: "concept",
        });
      }
      addWeightedEdge(edges, entry.id, conceptId);
    }
  }

  return { nodes: [...nodes.values()], edges };
}

export function getRelatedEntries(
  conceptEntry: WrongAnswerEntry,
  entries: WrongAnswerEntry[],
): WrongAnswerEntry[] {
  const title = conceptEntry.title.trim().toLowerCase();
  if (!title) return [];
  return entries.filter((entry) => {
    if (entry.id === conceptEntry.id) return false;
    return getEntryConceptLinks(entry).some((link) => link.toLowerCase() === title);
  });
}
