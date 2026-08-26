import { useEffect, useMemo, useState } from "react";
import type { WrongAnswerEntry } from "../../../types";
import { getImageUrl } from "../../../api";
import type { QuestionPngScope } from "../services/questionPng";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";

interface Props {
  entry: WrongAnswerEntry;
  questionNumber?: string;
  scope: QuestionPngScope;
  rendererVersion: string;
  currentFingerprint?: string;
  onVerificationChange?: (status: "unverified" | "needs_review" | "verified") => Promise<void> | void;
}

type View = "rendered" | "original" | "compare";

async function resolveAndDecode(filename: string | undefined): Promise<{ url: string | null; error: string | null }> {
  if (!filename) return { url: null, error: null };
  try {
    const url = await getImageUrl(filename);
    if (!url) return { url: null, error: "이미지 경로를 확인할 수 없습니다." };
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다.")); image.src = url; });
    if (typeof image.decode === "function") await image.decode();
    return { url, error: null };
  } catch {
    return { url: null, error: "이미지를 불러오지 못했습니다." };
  }
}

export default function QuestionRenderComparisonPanel({ entry, questionNumber, scope, rendererVersion, currentFingerprint, onVerificationChange }: Props) {
  const [view, setView] = useState<View>("rendered");
  const [cropIndex, setCropIndex] = useState(0);
  const [original, setOriginal] = useState<{ url: string | null; error: string | null }>({ url: null, error: null });
  const [rendered, setRendered] = useState<{ url: string | null; error: string | null }>({ url: null, error: null });
  const normalizedQuestionNumber = normalizeQuestionNumber(questionNumber ?? "");
  const crops = useMemo(() => (entry.questionSourceCrops ?? []).filter((item) => normalizeQuestionNumber(item.questionNumber) === normalizedQuestionNumber).slice().sort((left, right) => (left.order ?? 0) - (right.order ?? 0)), [entry.questionSourceCrops, normalizedQuestionNumber]);
  const crop = crops[Math.min(cropIndex, Math.max(0, crops.length - 1))];
  const verification = entry.questionRenderVerification?.find((item) => normalizeQuestionNumber(item.questionNumber) === normalizedQuestionNumber && (item.scope ?? "question") === scope && (item.rendererVersion ?? "legacy") === rendererVersion);
  const stale = Boolean(verification && (!currentFingerprint || verification.canonicalFingerprint !== currentFingerprint));
  const effectiveStatus = stale ? "needs_review" : verification?.status ?? "unverified";
  const imagesReady = Boolean(original.url && rendered.url && !stale);

  useEffect(() => { setCropIndex(0); }, [questionNumber]);
  useEffect(() => {
    let active = true;
    void Promise.all([resolveAndDecode(crop?.image), resolveAndDecode(verification?.renderedImage)]).then(([nextOriginal, nextRendered]) => {
      if (!active) return;
      setOriginal(nextOriginal); setRendered(nextRendered);
    });
    return () => { active = false; };
  }, [crop?.image, verification?.renderedImage]);

  return <section className="question-render-comparison" aria-label="원본과 정리본 비교">
    <div className="question-render-comparison__tabs" role="tablist" aria-label="문항 이미지 보기">
      {(["rendered", "original", "compare"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => setView(item)}>{item === "rendered" ? "정리본" : item === "original" ? "원본" : "원본과 비교"}</button>)}
    </div>
    <p className="form-hint">원본은 source crop이고 정리본은 canonical 문항에서 만든 파생 이미지입니다.</p>
    {crops.length > 1 && <div className="question-render-comparison__crop-nav"><button type="button" disabled={cropIndex === 0} onClick={() => setCropIndex((value) => value - 1)}>이전 원본</button><span>원본 {cropIndex + 1} / {crops.length}</span><button type="button" disabled={cropIndex >= crops.length - 1} onClick={() => setCropIndex((value) => value + 1)}>다음 원본</button></div>}
    {view === "rendered" && (rendered.url ? <img src={rendered.url} alt={`${questionNumber ?? "현재"}번 정리본`} /> : <p>{rendered.error ?? "저장된 정리본이 없습니다."}</p>)}
    {view === "original" && (original.url ? <img src={original.url} alt={`${questionNumber ?? "현재"}번 원본 crop`} /> : <p>{original.error ?? "연결된 원본 crop이 없습니다."}</p>)}
    {view === "compare" && <div className="question-render-comparison__grid"><figure>{original.url ? <img src={original.url} alt="원본 crop" /> : <p>{original.error ?? "원본 없음"}</p>}<figcaption>원본</figcaption></figure><figure>{rendered.url ? <img src={rendered.url} alt="정리본" /> : <p>{rendered.error ?? "정리본 없음"}</p>}<figcaption>정리본</figcaption></figure></div>}
    <p role="status">검증 상태: {effectiveStatus}{stale ? " · 재생성 필요" : ""}</p>
    {view === "compare" && verification?.renderedImage && crop?.image && onVerificationChange && <div className="question-render-comparison__actions">
      <button type="button" disabled={!imagesReady} title={imagesReady ? undefined : stale ? "현재 문항이 변경되어 재생성이 필요합니다." : "원본과 정리본을 모두 불러온 뒤 검증할 수 있습니다."} onClick={() => void onVerificationChange("verified")}>정리본 검증 완료</button>
      <button type="button" onClick={() => void onVerificationChange("needs_review")}>검토 필요로 표시</button>
    </div>}
  </section>;
}
