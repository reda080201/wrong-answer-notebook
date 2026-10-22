import { useEffect, useMemo, useRef } from "react";
import QuestionContentView from "../../../components/QuestionContentView";
import InlineQuestionText from "../../../components/InlineQuestionText";
import { defaultImagePreviewResolver, ImagePreviewContext } from "../../../shared/ui/ImagePreviewContext";
import type { ImportQuestionDraft } from "../model/importWorkspace";
import { getEditableContentSegments } from "../model/importWorkspace";

export default function WorkspaceQuestionPreview({ question, resolveImage }: {
  question: ImportQuestionDraft;
  resolveImage?: (filename: string) => Promise<string>;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.scrollIntoView({ block: "nearest" }); }, [question.id]);
  const segments = useMemo(() => getEditableContentSegments(question), [question]);
  return <ImagePreviewContext value={resolveImage ?? defaultImagePreviewResolver}>
    <article className="workspace-question-preview" aria-label={`${question.displayQuestionNumber}번 문항 미리보기`}>
      <h3 ref={heading}>{question.displayQuestionNumber}번 <span>{question.points ? `${question.points}점` : ""}</span></h3>
      {question.passage && <aside className="question-condition-box"><InlineQuestionText text={question.passage} figures={question.figures} /></aside>}
      <QuestionContentView text="" segments={segments} figures={question.figures} appendUnreferencedFigures={false} choices={question.choices.map(choice => `${choice.marker} ${choice.content}`.trim())} />
    </article>
  </ImagePreviewContext>;
}
