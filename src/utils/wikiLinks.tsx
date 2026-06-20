import { cloneElement, isValidElement, type ReactNode } from "react";
import MathText from "../components/MathText";

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
}

/**
 * Component that renders text with clickable wiki links.
 */
export function LinkifiedText({ text = "", onLinkClick, existingTargets }: LinkifiedTextProps) {
  if (!text.trim()) return null;
  const parsed = parseWikiLinks(text);

  return (
    <span className="wiki-linkified-text">
      {parsed.map((part) => {
        if (part.isLink) {
          const target = part.target ?? "";
          const label = part.label ?? "";
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
        return <MathText key={`math-${part.index}`} text={part.raw} />;
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
  existingTargets: Set<string>
): ReactNode[] {
  return nodes.flatMap((node, idx) => {
    if (typeof node === "string") {
      const parsed = parseWikiLinks(node);
      return parsed.map((part) => {
        if (part.isLink) {
          const target = part.target ?? "";
          const label = part.label ?? "";
          const exists = existingTargets.has(target.toLowerCase());
          return (
            <span
              key={`wiki-str-${idx}-${part.index}`}
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
            const exists = existingTargets.has(target.toLowerCase());
            return (
              <span
                key={`wiki-mark-child-${idx}-${part.index}`}
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
          return part.raw;
        });

        // Clone the element with new children containing wiki link nodes
        return cloneElement(node, undefined, children);
      }
    }

    return node;
  });
}
