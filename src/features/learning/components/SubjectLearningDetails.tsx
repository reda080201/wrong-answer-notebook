import type { LearningBlock } from "../../../types";
import MathText from "../../../components/MathText";
import { normalizeThinkerName } from "../utils/normalizeThinkerName";

function ListSection({ title, values }: { title: string; values?: string[] }) {
  if (!values?.length) return null;
  return <section><h4>{title}</h4><ul>{values.map((value) => <li key={value}><MathText text={value} /></li>)}</ul></section>;
}

export default function SubjectLearningDetails({ block }: { block: LearningBlock }) {
  const metadata = block.subjectMetadata;
  if (!metadata) return null;
  if (metadata.subject === "math") {
    return <div className="learning-hub-subject-details"><ListSection title="공식" values={metadata.formulaLatex} /><ListSection title="문제 신호" values={metadata.problemSignals} /><ListSection title="언제 사용하는가" values={metadata.whenToUse} /><ListSection title="적용하면 안 되는 경우" values={metadata.avoidWhen} /><ListSection title="선수 개념" values={metadata.prerequisites} /><ListSection title="풀이 단계" values={metadata.solutionSteps} /></div>;
  }
  if (metadata.subject === "language_media") {
    return <div className="learning-hub-subject-details"><ListSection title={metadata.area === "media" ? "매체 규칙" : "언어 규칙"} values={metadata.rule ? [metadata.rule] : undefined} /><ListSection title="예외" values={metadata.exceptions} /><ListSection title="판별 기준" values={metadata.identificationClues} /><ListSection title="선지 함정" values={metadata.commonWrongClaims} /></div>;
  }
  if (metadata.subject === "social_culture") {
    return <div className="learning-hub-subject-details"><ListSection title="핵심 정의" values={metadata.definition ? [metadata.definition] : undefined} /><ListSection title="판별 기준" values={metadata.judgementCriteria} /><ListSection title="지문 단서" values={metadata.passageClues} /><ListSection title="사례 패턴" values={metadata.casePatterns} /><ListSection title="비슷한 개념" values={metadata.comparisonTargets} /><ListSection title="오개념" values={metadata.commonConfusions} /></div>;
  }
  return <div className="learning-hub-subject-details"><ListSection title="사상가" values={metadata.thinkers?.map(normalizeThinkerName)} /><ListSection title="핵심 주장" values={metadata.keyClaims} /><ListSection title="긍정하는 주장" values={metadata.affirmedClaims} /><ListSection title="부정하는 주장" values={metadata.rejectedClaims} /><ListSection title="지문 판별 단서" values={metadata.passageClues} /><ListSection title="비교 사상가" values={metadata.comparisonThinkers?.map(normalizeThinkerName)} /><ListSection title="혼동하기 쉬운 주장" values={metadata.commonConfusions} /></div>;
}
