/** Display adapter only: never rewrite stored question text or annotation offsets. */
export function typesetMathExpression(value: string, displayMode = false): string {
  const superscripts: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "ⁿ": "n", "ⁱ": "i", "⁺": "+", "⁻": "-" };
  const subscripts: Record<string, string> = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9", "ₙ": "n", "ᵢ": "i", "ₖ": "k", "₊": "+", "₋": "-" };
  const expression = value
    .replace(/[′’]/g, "'").replace(/″/g, "''").replace(/‴/g, "'''")
    .replace(/([A-Za-z)\]])((?:\\prime\s*)+)(?![A-Za-z])/g, "$1^{$2}")
    .replace(/∑|Σ(?=\s*[_^])/g, "\\sum ")
    .replace(/∏/g, "\\prod ").replace(/∫/g, "\\int ")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿⁱ⁺⁻]+/g, run => `^{${[...run].map(char => superscripts[char]).join("")}}`)
    .replace(/[₀₁₂₃₄₅₆₇₈₉ₙᵢₖ₊₋]+/g, run => `_{${[...run].map(char => subscripts[char]).join("")}}`)
    .replace(/(^|[^\\A-Za-z])(sin|cos|tan|log|ln|lim)(?=\s|[(_^])/g, "$1\\$2");
  // Inline TeX normally puts sum/limit bounds beside the operator. Textbook
  // expressions need display style even when embedded in a Korean sentence.
  return !displayMode && /\\(?:sum|prod|int|lim|d?frac)(?![A-Za-z])/.test(expression)
    ? `\\displaystyle ${expression}` : expression;
}
