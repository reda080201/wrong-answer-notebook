import { useEffect, useState } from "react";
import type { WrongAnswerEntry } from "../../../types";
import { getImageUrl } from "../../../api";

interface Props {
  entry: WrongAnswerEntry;
  questionNumber?: string;
}

type View = "rendered" | "original" | "compare";

export default function QuestionRenderComparisonPanel({ entry, questionNumber }: Props) {
  const [view, setView] = useState<View>("rendered");
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const crop = entry.questionSourceCrops?.find((item) => item.questionNumber === questionNumber);
  const verification = entry.questionRenderVerification?.find((item) => item.questionNumber === questionNumber);

  useEffect(() => {
    let active = true;
    setOriginalUrl(null);
    setRenderedUrl(null);
    void Promise.all([
      crop?.image ? getImageUrl(crop.image) : Promise.resolve(null),
      verification?.renderedImage ? getImageUrl(verification.renderedImage) : Promise.resolve(null),
    ]).then(([original, rendered]) => {
      if (!active) return;
      setOriginalUrl(original);
      setRenderedUrl(rendered);
    });
    return () => { active = false; };
  }, [crop?.image, verification?.renderedImage]);

  return <section className="question-render-comparison" aria-label="원본과 정리본 비교">
    <div className="question-render-comparison__tabs" role="tablist" aria-label="문항 이미지 보기">
      {(["rendered", "original", "compare"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => setView(item)}>{item === "rendered" ? "정리본" : item === "original" ? "원본" : "원본과 비교"}</button>)}
    </div>
    <p className="form-hint">정리본은 canonical 문항에서 생성된 파생 이미지이며 원본과 자동 동일성을 주장하지 않습니다.</p>
    {view === "rendered" && (renderedUrl ? <img src={renderedUrl} alt={`${questionNumber ?? "현재"}번 정리본`} /> : <p>저장된 정리본이 없습니다.</p>)}
    {view === "original" && (originalUrl ? <img src={originalUrl} alt={`${questionNumber ?? "현재"}번 원본 crop`} /> : <p>연결된 원본 crop이 없습니다.</p>)}
    {view === "compare" && <div className="question-render-comparison__grid"><figure>{originalUrl ? <img src={originalUrl} alt="원본 crop" /> : <p>원본 없음</p>}<figcaption>원본</figcaption></figure><figure>{renderedUrl ? <img src={renderedUrl} alt="정리본" /> : <p>정리본 없음</p>}<figcaption>정리본</figcaption></figure></div>}
    <p role="status">검증 상태: {verification?.status ?? "unverified"}</p>
  </section>;
}
