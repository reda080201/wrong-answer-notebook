/**
 * Converts a small, conservative subset of legacy lecture prose into the
 * explicit delimiters understood by MathText.
 *
 * This is intentionally a display-only adapter. It must not be used while
 * normalizing or persisting entries because ambiguous slash expressions are
 * deliberately left untouched.
 */

function hasExplicitMath(text: string): boolean {
  return /\$(?:\$|[^\n$])|\\\(|\\\[|\\(?:frac|lim|sqrt|sum|int)\b/.test(text);
}

function normalizeInfinity(value: string): string {
  return value.trim().replace(/(^|[-+])∞/g, "$1\\infty");
}

function normalizeGroupedFraction(text: string): string {
  return text.replace(/\(([^()\n]+)\)\s*\/\s*\(([^()\n]+)\)/g, (_match, numerator: string, denominator: string) => {
    return `\\frac{${numerator.trim()}}{${denominator.trim()}}`;
  });
}

function normalizeLabeledFraction(text: string): string {
  const match = text.match(/^\s*(?:분수|fraction)\s*[:：]?\s*([A-Za-z0-9]+)\s*\/\s*([A-Za-z0-9]+)\s*$/i);
  if (!match) return text;
  return `\\(\\frac{${match[1]}}{${match[2]}}\\)`;
}

function normalizeLimit(text: string): string {
  const match = text.match(/^\s*lim(?:it)?\s+([A-Za-z])\s*(?:→|->|⟶|to)\s*([^\s,;:]+)\s+(.+?)\s*$/i);
  if (!match) return text;

  const body = normalizeGroupedFraction(match[3].trim());
  // A limit body needs an unmistakable mathematical shape. This avoids
  // converting lecture prose such as "limit to the next section".
  if (!/[()[\]{}^_=+*-]|\\[A-Za-z]+|\d/.test(body)) return text;

  return `\\(\\lim_{${match[1]}\\to ${normalizeInfinity(match[2])}} ${body}\\)`;
}

function normalizeLegacyLectureMathLine(line: string): string {
  if (!line.trim() || hasExplicitMath(line)) return line;

  const limit = normalizeLimit(line);
  if (limit !== line) return limit;

  const labeledFraction = normalizeLabeledFraction(line);
  if (labeledFraction !== line) return labeledFraction;

  return normalizeGroupedFraction(line);
}

/**
 * Normalize clear legacy plaintext math for lecture display only.
 *
 * The function is pure and returns the original text for ambiguous or
 * unsupported input. In particular, ordinary `1/2`, `x/y`, and `a/b+c`
 * expressions are not treated as fractions.
 */
export function normalizeLegacyLectureMathForDisplay(text: string): string {
  return text.split(/(\r?\n)/).map((part) => /^\r?\n$/.test(part) ? part : normalizeLegacyLectureMathLine(part)).join("");
}

export default normalizeLegacyLectureMathForDisplay;
