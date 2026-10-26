import { useMemo } from "react";
import type { QuestionSourceReference, WrongAnswerEntry } from "../../../types";
import Dialog from "../../../shared/ui/Dialog";
import QuestionContentView from "../../../components/QuestionContentView";
import MathText from "../../../components/MathText";
import ImageGallery from "../../../components/ImageGallery";
import { entryAiMaterials } from "../../study-ai/model";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";
import { useRealExamProtection } from "../../exam/services/realExamProtection";

export default function ExamSourcePreview({ source, entries, onClose }: { source: QuestionSourceReference; entries: WrongAnswerEntry[]; onClose(): void }) {
  const protection = useRealExamProtection();
  const entry = entries.find(item => item.id === source.sourceEntryId);
  const matches = useMemo(() => entry ? entryAiMaterials(entry).filter(material => normalizeQuestionNumber(material.source.sourceQuestionNumber) === normalizeQuestionNumber(source.sourceQuestionNumber)) : [], [entry, source.sourceQuestionNumber]);
  const question = matches.length === 1 ? matches[0].snapshot : undefined;
  return <Dialog open title="원본 문항 확인" onClose={onClose} size="lg" footer={<button type="button" onClick={onClose}>구성으로 돌아가기</button>}>
    <p>{source.sourceEntryTitle} · 원문 {source.sourceQuestionNumber}번</p>
    {protection.unavailable || protection.sourceIds.has(source.sourceEntryId) ? <p role="status">진행 중 실전 시험의 자료는 제출 후 확인할 수 있습니다.</p> : !entry ? <p role="status">원본 항목을 찾을 수 없습니다. 만들던 구성은 보존됩니다.</p> : !question ? <p role="status">원문 문항이 없거나 번호가 중복되어 연결을 확인할 수 없습니다. 만들던 구성은 보존됩니다.</p> : <>
      {question.passage && <QuestionContentView text={question.passage} figures={question.figures} />}
      <QuestionContentView text={question.question} segments={question.contentSegments} figures={question.figures} />
      {question.questionImages.length > 0 && <ImageGallery filenames={question.questionImages} />}
      {question.choices.length > 0 && <ol>{question.choices.map((choice, index) => <li key={index}><MathText text={choice} /></li>)}</ol>}
    </>}
  </Dialog>;
}
