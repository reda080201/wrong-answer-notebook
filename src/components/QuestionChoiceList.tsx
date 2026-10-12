import type { QuestionContentSegment, SheetFigureItem } from "../types";
import { parseChoice } from "../utils/choice";
import InlineQuestionText from "./InlineQuestionText";

function normalizedChoiceKey(choice: { marker: string; content: string }): string {
  return `${choice.marker.trim()}|${choice.content.replace(/\s+/g, " ").trim()}`;
}

export function getVisibleQuestionChoices(choices: string[], segments: QuestionContentSegment[]) {
  const represented = new Map<string, number>();
  for (const segment of segments) {
    if (segment.type !== "text") continue;
    for (const line of segment.text.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
      const parsed = parseChoice(line);
      if (!parsed.marker) continue;
      const key = normalizedChoiceKey(parsed);
      represented.set(key, (represented.get(key) ?? 0) + 1);
    }
  }
  return choices.map((choice, index) => {
    const parsed = parseChoice(choice);
    const key = normalizedChoiceKey(parsed);
    const count = represented.get(key) ?? 0;
    if (count > 0) {
      represented.set(key, count - 1);
      return null;
    }
    return { choice, index, marker: parsed.marker || `${index + 1}.`, content: parsed.content };
  }).filter((choice): choice is { choice: string; index: number; marker: string; content: string } => Boolean(choice));
}

export default function QuestionChoiceList({ choices, segments, figures = [] }: { choices: string[]; segments: QuestionContentSegment[]; figures?: SheetFigureItem[] }) {
  const visibleChoices = getVisibleQuestionChoices(choices, segments);
  if (!visibleChoices.length) return null;
  return <ol className="structured-question-choices" aria-label="선택지">
    {visibleChoices.map(({ choice, index, marker, content }) => <li key={`${index}-${choice}`}><span className="structured-question-choice-marker" aria-hidden="true">{marker}</span><InlineQuestionText text={content} figures={figures} /></li>)}
  </ol>;
}
