import { useEffect, useMemo, useState } from "react";
import type { WrongAnswerEntry } from "../../../types";
import { getImageUrl } from "../../../api";
import type { QuestionPngScope } from "../services/questionPng";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";
import { getEntryQuestions } from "../../../utils/entryQuestions";
import { resolveQuestionAssets } from "../../../utils/questionAssets";

interface Props {
  entry: WrongAnswerEntry;
  questionNumber?: string;
  scope: QuestionPngScope;
  rendererVersion: string;
  currentFingerprint?: string;
  onVerificationChange?: (status: "unverified" | "needs_review" | "verified", expectedFingerprint?: string) => Promise<void> | void;
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
  const [viewedCropIds, setViewedCropIds] = useState<Set<string>>(new Set());
  const [allOriginalsConfirmed, setAllOriginalsConfirmed] = useState(false);
  const normalizedQuestionNumber = normalizeQuestionNumber(questionNumber ?? "");
  const question = useMemo(() => getEntryQuestions(entry).find((item) => normalizeQuestionNumber(item.questionNumber) === normalizedQuestionNumber), [entry, normalizedQuestionNumber]);
  const assets = useMemo(() => question ? resolveQuestionAssets(entry, question) : { sourceCrops: [], sourcePages: [], figureAssets: [] }, [entry, question]);
  const crops = assets.sourceCrops;
  const crop = crops[Math.min(cropIndex, Math.max(0, crops.length - 1))];
  const originalFilename = crop?.image ?? assets.figureAssets.find((filename) => entry.figures?.some((figure) => figure.original?.image === filename)) ?? assets.sourcePages[0];
  const verification = entry.questionRenderVerification?.find((item) => normalizeQuestionNumber(item.questionNumber) === normalizedQuestionNumber && (item.scope ?? "question") === scope && (item.rendererVersion ?? "legacy") === rendererVersion);
  const stale = Boolean(verification && (!currentFingerprint || verification.canonicalFingerprint !== currentFingerprint));
  const effectiveStatus = stale ? "needs_review" : verification?.status ?? "unverified";
  const imagesReady = Boolean(original.url && rendered.url && !stale);
  const [allOriginalsReady, setAllOriginalsReady] = useState(crops.length <= 1);
  const allCropsViewed = crops.length === 0 || crops.every((item) => item.id && viewedCropIds.has(item.id));
  const reviewRequirementMet = allCropsViewed || allOriginalsConfirmed;

  useEffect(() => {
    setCropIndex(0);
    setViewedCropIds(new Set());
    setAllOriginalsConfirmed(false);
  }, [normalizedQuestionNumber, scope, rendererVersion, currentFingerprint]);
  useEffect(() => {
    let active = true;
    void Promise.all([Promise.all(crops.map((item) => resolveAndDecode(item.image))), resolveAndDecode(originalFilename), resolveAndDecode(verification?.renderedImage)]).then(([allOriginals, nextOriginal, nextRendered]) => {
      if (!active) return;
      setAllOriginalsReady(allOriginals.every((item) => Boolean(item.url)));
      setOriginal(nextOriginal); setRendered(nextRendered);
    });
    return () => { active = false; };
  }, [crops, originalFilename, verification?.renderedImage]);

  const selectCrop = (nextIndex: number) => {
    const bounded = Math.max(0, Math.min(nextIndex, Math.max(0, crops.length - 1)));
    setCropIndex(bounded);
    if ((view === "original" || view === "compare") && crops[bounded]?.id) {
      setViewedCropIds((current) => new Set(current).add(crops[bounded].id!));
    }
  };

  return <section className="question-render-comparison" aria-label="원본과 정리본 비교">
    <div className="question-render-comparison__tabs" role="tablist" aria-label="문항 이미지 보기">
    {(["rendered", "original", "compare"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => { setView(item); if ((item === "original" || item === "compare") && crop?.id) setViewedCropIds((current) => new Set(current).add(crop.id!)); }}>{item === "rendered" ? "정리본" : item === "original" ? "원본" : "원본과 비교"}</button>)}
    </div>
    <p className="form-hint">원본은 source crop이고 정리본은 canonical 문항에서 만든 파생 이미지입니다.</p>
    {crops.length > 1 && <div className="question-render-comparison__crop-nav"><button type="button" disabled={cropIndex === 0} onClick={() => selectCrop(cropIndex - 1)}>이전 원본</button><span>원본 {cropIndex + 1} / {crops.length}</span><button type="button" disabled={cropIndex >= crops.length - 1} onClick={() => selectCrop(cropIndex + 1)}>다음 원본</button></div>}
    {view === "rendered" && (rendered.url ? <img src={rendered.url} alt={`${questionNumber ?? "현재"}번 정리본`} /> : <p>{rendered.error ?? "저장된 정리본이 없습니다."}</p>)}
    {view === "original" && (original.url ? <img src={original.url} alt={`${questionNumber ?? "현재"}번 원본`} /> : <p>{original.error ?? "연결된 원본이 없습니다."}</p>)}
    {view === "compare" && <div className="question-render-comparison__grid"><figure>{original.url ? <img src={original.url} alt="원본 crop" /> : <p>{original.error ?? "원본 없음"}</p>}<figcaption>원본</figcaption></figure><figure>{rendered.url ? <img src={rendered.url} alt="정리본" /> : <p>{rendered.error ?? "정리본 없음"}</p>}<figcaption>정리본</figcaption></figure></div>}
    <p role="status">검증 상태: {effectiveStatus}{stale ? " · 재생성 필요" : ""}</p>
    {view === "compare" && verification?.renderedImage && originalFilename && onVerificationChange && <div className="question-render-comparison__actions">
      {crops.length > 1 && !allCropsViewed && <label><input type="checkbox" checked={allOriginalsConfirmed} onChange={(event) => setAllOriginalsConfirmed(event.target.checked)} /> 모든 원본을 확인했습니다</label>}
      <button type="button" disabled={!imagesReady || !allOriginalsReady || !reviewRequirementMet} title={imagesReady && allOriginalsReady && reviewRequirementMet ? undefined : stale ? "현재 문항이 변경되어 재생성이 필요합니다." : "연결된 모든 원본과 정리본을 불러오고 확인한 뒤 검증할 수 있습니다."} onClick={() => void onVerificationChange("verified", currentFingerprint)}>정리본 검증 완료</button>
      <button type="button" onClick={() => void onVerificationChange("needs_review")}>검토 필요로 표시</button>
    </div>}
  </section>;
}
