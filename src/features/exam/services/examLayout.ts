/** Compact defaults apply only to new view state, never saved session choices. */
export function prefersCompactExamLayout(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(max-width: 900px)")?.matches === true;
}
