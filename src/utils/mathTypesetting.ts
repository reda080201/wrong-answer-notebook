/** Convert only an unambiguous division of two complete atoms. Keep TeX
 * command arguments and chained/implicit divisions unchanged for review. */
function stackSimpleFractions(value: string, depth = 0): string {
  if (depth > 32) return value;
  const tokens: Array<{ start: number; end: number; atom: boolean; raw: string }> = [];
  const nested: Array<{ start: number; end: number; text: string }> = [];
  const groupEnd = (start: number): number => {
    const close = ({ "(": ")", "[": "]", "{": "}" } as Record<string, string>)[value[start]];
    if (!close) return start;
    let cursor = start + 1;
    while (cursor < value.length) {
      if (value[cursor] === "\\") { cursor += 2; continue; }
      if ("([{".includes(value[cursor])) {
        const end = groupEnd(cursor);
        if (end === cursor) return start;
        cursor = end; continue;
      }
      if (value[cursor] === close) return cursor + 1;
      cursor++;
    }
    return start;
  };
  for (let cursor = 0; cursor < value.length;) {
    if (/\s/.test(value[cursor])) { cursor++; continue; }
    const start = cursor;
    let atom = false;
    if ("({".includes(value[cursor])) {
      cursor = groupEnd(cursor); atom = cursor > start;
    } else if (value[cursor] === "\\") {
      const command = value.slice(cursor).match(/^\\[A-Za-z]+/);
      if (command) {
        cursor += command[0].length;
        while (value[cursor] === "{") { const end = groupEnd(cursor); if (end === cursor) break; cursor = end; }
        atom = /^\\(?:sqrt|[dt]?frac)\{/.test(value.slice(start, cursor));
      }
    } else if (/[A-Za-z0-9α-ωΑ-Ω]/u.test(value[cursor])) {
      const number = value.slice(cursor).match(/^\d+(?:\.\d+)?/);
      cursor += number?.[0].length ?? 1;
      atom = true;
      if (!number && value[cursor] === "(") cursor = groupEnd(cursor) || cursor;
    }
    if (atom) {
      while (value[cursor] === "_" || value[cursor] === "^") {
        const next = cursor + 1;
        const end = value[next] === "{" ? groupEnd(next) : /[A-Za-z0-9]/.test(value[next] ?? "") ? next + 1 : next;
        if (end <= next) break;
        cursor = end;
      }
      while (value[cursor] === "'") cursor++;
    }
    if (cursor === start) cursor++;
    let raw = value.slice(start, cursor);
    const parentheses = atom ? raw.indexOf("(") : -1;
    if (parentheses >= 0) {
      const open = start + parentheses;
      const end = groupEnd(open);
      if (end > open) {
        raw = value.slice(start, open + 1) + stackSimpleFractions(value.slice(open + 1, end - 1), depth + 1) + value.slice(end - 1, cursor);
        if (raw !== value.slice(start, cursor)) nested.push({ start, end: cursor, text: raw });
      }
    }
    tokens.push({ start, end: cursor, atom, raw });
  }
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  tokens.forEach((token, index) => {
    if (token.raw !== "/") return;
    const left = tokens[index - 1], right = tokens[index + 1];
    if (!left?.atom || !right?.atom || tokens[index - 2]?.raw === "/" || tokens[index + 2]?.raw === "/") return;
    // a/2b has ambiguous grouping; do not silently turn it into (a/2)b.
    if (tokens[index + 2]?.atom) return;
    if (tokens[index - 2]?.atom && tokens[index - 2].end === left.start) return;
    replacements.push({ start: left.start, end: right.end, text: `\\frac{${left.raw}}{${right.raw}}` });
  });
  replacements.push(...nested.filter(part => !replacements.some(outer => outer.start <= part.start && outer.end >= part.end)));
  replacements.sort((a, b) => a.start - b.start);
  let result = value;
  for (const replacement of replacements.reverse()) result = result.slice(0, replacement.start) + replacement.text + result.slice(replacement.end);
  return result;
}

/** Display adapter only: never rewrite stored question text or annotation offsets. */
export function typesetMathExpression(value: string, displayMode = false): string {
  const superscripts: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "ⁿ": "n", "ⁱ": "i", "⁺": "+", "⁻": "-" };
  const subscripts: Record<string, string> = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9", "ₐ": "a", "ₑ": "e", "ₒ": "o", "ₓ": "x", "ₕ": "h", "ₖ": "k", "ₗ": "l", "ₘ": "m", "ₙ": "n", "ₚ": "p", "ₛ": "s", "ₜ": "t", "ᵢ": "i", "₊": "+", "₋": "-" };
  const expression = stackSimpleFractions(value
    .replace(/[′’]/g, "'").replace(/″/g, "''").replace(/‴/g, "'''")
    .replace(/([A-Za-z)\]])((?:\\prime\s*)+)(?![A-Za-z])/g, "$1^{$2}")
    .replace(/∑|Σ(?=\s*[_^])/g, "\\sum ")
    .replace(/∏/g, "\\prod ").replace(/∫/g, "\\int ")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿⁱ⁺⁻]+/g, run => `^{${[...run].map(char => superscripts[char]).join("")}}`)
    .replace(/[₀₁₂₃₄₅₆₇₈₉ₐₑₒₓₕₖₗₘₙₚₛₜᵢ₊₋]+/g, run => `_{${[...run].map(char => subscripts[char]).join("")}}`)
    .replace(/√\s*\(([^()]*)\)/g, "\\sqrt{$1}")
    .replace(/√\s*(\d+(?:\.\d+)?|[A-Za-z])/g, "\\sqrt{$1}")
    .replace(/\\operatorname\{Area\}|(?<![A-Za-z\\])Area(?=\s*\()/g, "\\text{넓이}")
    .replace(/(^|[^\\A-Za-z])(sin|cos|tan|log|ln|lim)(?=\s|[(_^])/g, "$1\\$2"));
  // Inline TeX normally puts sum/limit bounds beside the operator. Textbook
  // expressions need display style even when embedded in a Korean sentence.
  return !displayMode && /\\(?:sum|prod|int|lim|d?frac)(?![A-Za-z])/.test(expression)
    ? `\\displaystyle ${expression}` : expression;
}
