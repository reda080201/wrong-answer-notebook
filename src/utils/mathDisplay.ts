import { normalizeLegacyMathCommandsForDisplay } from "./legacyMathCommands";

export function normalizeMathForDisplay(value: string): string {
  return normalizeLegacyMathCommandsForDisplay(value);
}

export function hasUnbalancedMathDelimiter(value: string): boolean {
  const display = (value.match(/\$\$/g) ?? []).length;
  const inline = (value.match(/(?<!\$)\$(?!\$)/g) ?? []).length;
  const bracketed = (value.match(/\\\[|\\\]|\\\(|\\\)/g) ?? []).length;
  return display % 2 !== 0 || inline % 2 !== 0 || bracketed % 2 !== 0;
}
