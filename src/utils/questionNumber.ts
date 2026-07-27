/** Normalize the question labels used by imported sheets and answer keys. */
export function normalizeQuestionNumber(value: string | number | undefined | null): string {
  const raw = `${value ?? ""}`.trim();
  const normalized = raw
    .replace(/^\[\s*/, "")
    .replace(/\s*\]$/, "")
    .replace(/^#/, "")
    .replace(/^(?:문제|문항)\s*/i, "")
    .replace(/\s*(?:[.)]|번)\s*$/, "")
    .replace(/^0+(?=\d)/, "")
    .trim();
  return normalized || raw;
}
