const TRAILING_SEPARATOR = /\s+\/\s*$/;

/** Removes only the legacy, whitespace-delimited slash appended after a choice. */
export function stripLegacyChoiceSeparator(value: string): string {
  return value.replace(TRAILING_SEPARATOR, "").trimEnd();
}
