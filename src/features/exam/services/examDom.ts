export function sanitizeExamQuestionDomId(questionNumber: string): string {
  const encoded = Array.from(questionNumber.trim()).map((character) => {
    return /[A-Za-z0-9_-]/.test(character) ? character : `u${character.codePointAt(0)?.toString(16) ?? "0"}`;
  }).join("-");
  return `exam-question-${encoded || "unknown"}`;
}
