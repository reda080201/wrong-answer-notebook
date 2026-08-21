const LEGACY_MATH_COMMANDS = "lim|frac|sqrt|times|sum|int|sin|cos|tan|log|left|right";
const LEGACY_COMMAND_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}_\\\\])/(${LEGACY_MATH_COMMANDS})(?![\\p{L}\\p{N}_])`,
  "gu",
);

// URLs and path-like spans can contain an allowlisted segment that is not a command.
const PROTECTED_SPAN_PATTERN = /(?:https?:\/\/|ftp:\/\/|\/\/)[^\s<>"']+|(?:\\\\|[A-Za-z]:[\\/])[^\s<>"']*|(?<![\p{L}\p{N}_])(?:\.\.?[\\/]|~[\\/])[^\s<>"']*|(?<![\p{L}\p{N}_])\/(?:[A-Za-z0-9._~-]+\/)+[A-Za-z0-9._~-]*/gu;

function normalizeOutsideProtectedSpans(value: string): string {
  let result = "";
  let cursor = 0;

  for (const match of value.matchAll(PROTECTED_SPAN_PATTERN)) {
    const start = match.index ?? 0;
    result += value.slice(cursor, start).replace(LEGACY_COMMAND_PATTERN, "\\$1");
    result += match[0];
    cursor = start + match[0].length;
  }

  return result + value.slice(cursor).replace(LEGACY_COMMAND_PATTERN, "\\$1");
}

/** Normalize legacy slash-prefixed math commands for display without changing the source value. */
export function normalizeLegacyMathCommandsForDisplay(value: string): string {
  return normalizeOutsideProtectedSpans(value);
}

/** Normalize legacy slash-prefixed math commands at the import boundary. */
export function normalizeImportedMathCommands(value: string): string {
  return normalizeOutsideProtectedSpans(value);
}
