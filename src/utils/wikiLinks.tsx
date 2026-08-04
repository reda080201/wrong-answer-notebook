import { cloneElement, isValidElement, type ReactNode } from "react";
import MathText from "../components/MathText";
import { useConceptLinkRuntime } from "../features/learning/components/ConceptLinkProvider";
import type { ConceptLinkRuntime } from "../features/learning/components/ConceptLinkProvider";
import type { ConceptLinkResolveContext } from "../features/learning/utils/conceptIndex";

export interface ParsedWikiPart {
  isLink: boolean;
  raw: string;
  target?: string;
  label?: string;
  index: number;
}

/**
 * Splits a text by Obsidian-style [[Target]] or [[Target|Label]] wikilinks.
 */
export function parseWikiLinks(text: string): ParsedWikiPart[] {
  if (!text) return [];
  // Matches [[some target]] or [[some target|some label]]
  const parts = text.split(/(\[\[[^\]]+\]\])/g);
  return parts.map((part, index) => {
    if (part.startsWith("[[") && part.endsWith("]]")) {
      const content = part.slice(2, -2);
      const pipeIndex = content.indexOf("|");
      let target = content;
      let label = content;
      if (pipeIndex !== -1) {
        target = content.slice(0, pipeIndex).trim();
        label = content.slice(pipeIndex + 1).trim();
      } else {
        target = target.trim();
        label = label.trim();
      }
      return { isLink: true, raw: part, target, label, index };
    }
    return { isLink: false, raw: part, index };
  });
}

interface LinkifiedTextProps {
  text?: string;
  onLinkClick: (target: string) => void;
  existingTargets: Set<string>;
  conceptContext?: ConceptLinkResolveContext;
}

/**
 * Component that renders text with clickable wiki links.
 */
export function LinkifiedText({ text = "", onLinkClick, existingTargets, conceptContext }: LinkifiedTextProps) {
  const conceptRuntime = useConceptLinkRuntime();
  if (!text.trim()) return null;
  const parsed = parseWikiLinks(text);

  const renderPlain = (raw: string, key: string) => {
    if (!conceptRuntime?.automaticEnabled || /https?:\/\/|\$|\\\(|\\\[/.test(raw)) return <MathText key={key} text={raw} />;
    const aliases = conceptRuntime.aliases.filter((alias) => alias.trim());
    if (!aliases.length) return <MathText key={key} text={raw} />;
    const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matcher = new RegExp(`(^|[^\\p{L}\\p{N}_])(${aliases.map(escape).join("|")})((?:에서|으로|에게|부터|은|는|이|가|을|를|의|에|와|과|도|만)?)(?=$|[^\\p{L}\\p{N}_])`, "giu");
    const nodes: ReactNode[] = [];
    let last = 0;
    for (const match of raw.matchAll(matcher)) {
      const index = match.index ?? 0;
      const prefix = match[1] ?? "";
      const target = match[2] ?? "";
      const particle = match[3] ?? "";
      const start = index + prefix.length;
      if (start > last) nodes.push(<MathText key={`${key}-text-${last}`} text={raw.slice(last, start)} />);
      const item = conceptRuntime.resolve(target, conceptContext);
      nodes.push(item ? <button key={`${key}-concept-${start}`} type="button" className="wiki-link wiki-link--exists" onClick={() => conceptRuntime.open(item)}>{target}</button> : <MathText key={`${key}-fallback-${start}`} text={target} />);
      if (particle) nodes.push(<MathText key={`${key}-particle-${start}`} text={particle} />);
      last = index + match[0].length;
    }
    if (last === 0) return <MathText key={key} text={raw} />;
    if (last < raw.length) nodes.push(<MathText key={`${key}-text-end`} text={raw.slice(last)} />);
    return <>{nodes}</>;
  };

  return (
    <span className="wiki-linkified-text">
      {parsed.map((part) => {
        if (part.isLink) {
          const target = part.target ?? "";
          const label = part.label ?? "";
          const concept = conceptRuntime?.resolve(target, conceptContext);
          if (conceptRuntime && !conceptRuntime.enabled) return <MathText key={`wl-${part.index}`} text={label} />;
          if (conceptRuntime?.enabled && concept) return <button key={`wl-${part.index}`} type="button" className="wiki-link wiki-link--exists" onClick={() => conceptRuntime.open(concept)}>{label}</button>;
          const exists = existingTargets.has(target.toLowerCase());
          return (
            <span
              key={`wl-${part.index}`}
              className={`wiki-link ${exists ? "wiki-link--exists" : "wiki-link--new"}`}
              onClick={(e) => {
                e.stopPropagation();
                onLinkClick(target);
              }}
              title={exists ? `"${target}" 항목으로 이동` : `"${target}" 항목 새로 만들기`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onLinkClick(target);
                }
              }}
            >
              {label}
            </span>
          );
        }
        return renderPlain(part.raw, `math-${part.index}`);
      })}
    </span>
  );
}

/**
 * Processes ReactNodes (e.g. from annotated text rendering) and linkifies any text parts,
 * even inside annotation <mark> elements.
 */
export function renderWikiLinksInNodes(
  nodes: ReactNode[],
  onLinkClick: (target: string) => void,
  existingTargets: Set<string>,
  conceptRuntime?: ConceptLinkRuntime | null,
  conceptContext?: ConceptLinkResolveContext,
): ReactNode[] {
  const renderLink = (target: string, label: string, key: string) => {
    if (conceptRuntime && !conceptRuntime.enabled) return <span key={key}>{label}</span>;
    const concept = conceptRuntime?.resolve(target, conceptContext);
    if (conceptRuntime?.enabled && concept) {
      return <button key={key} type="button" className="wiki-link wiki-link--exists" onClick={() => conceptRuntime.open(concept)}>{label}</button>;
    }
    const exists = existingTargets.has(target.toLowerCase());
    return <span key={key} className={`wiki-link ${exists ? "wiki-link--exists" : "wiki-link--new"}`} onClick={(e) => { e.stopPropagation(); onLinkClick(target); }} title={exists ? `"${target}" 항목으로 이동` : `"${target}" 항목 새로 만들기`} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onLinkClick(target); } }}>{label}</span>;
  };
  return nodes.flatMap((node, idx) => {
    if (typeof node === "string") {
      const parsed = parseWikiLinks(node);
      return parsed.map((part) => {
        if (part.isLink) {
          const target = part.target ?? "";
          const label = part.label ?? "";
          return renderLink(target, label, `wiki-str-${idx}-${part.index}`);
        }
        return part.raw;
      });
    }

    // Check if it's a React element (like a <mark> annotation tag)
    if (isValidElement<{ children?: ReactNode }>(node)) {
      if (typeof node.props.children === "string") {
        const text = node.props.children;
        const parsed = parseWikiLinks(text);
        const children = parsed.map((part) => {
          if (part.isLink) {
            const target = part.target ?? "";
            const label = part.label ?? "";
            return renderLink(target, label, `wiki-mark-child-${idx}-${part.index}`);
          }
          return part.raw;
        });

        // Clone the element with new children containing wiki link nodes
        return cloneElement(node, undefined, children);
      }
    }

    return node;
  });
}
