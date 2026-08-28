import { useEffect, useRef, useState } from "react";
import MathText from "../../../components/MathText";
import Dialog from "../../../shared/ui/Dialog";
import type { ProblemSourceType, QuestionAnswerType } from "../../../types";
import { difficultyScoreLabel } from "../../../utils/difficulty";
import { normalizeLegacyMathCommandsForDisplay } from "../../../utils/legacyMathCommands";
import { PROBLEM_SOURCE_LABELS } from "../../../utils/problemSource";
import type { QuestionBankItem } from "../model/questionBankTypes";
import type { QuestionMetaPatch } from "../utils/patchQuestionClassification";

interface QuestionBankDetailProps {
  item: QuestionBankItem | null;
  onClose: () => void;
  onOpenQuestion: (item: QuestionBankItem) => void;
  onPatchClassification?: (entryId: string, questionNumber: string, patch: QuestionMetaPatch) => Promise<void> | void;
  inline?: boolean;
}

const answerTypeLabel: Record<QuestionAnswerType, string> = {
  multiple_choice: "객관식",
  short_answer: "단답형",
  essay: "서술형",
  unknown: "미분류",
};

const list = (value: string) => value.split(",").map((part) => part.trim()).filter(Boolean);
const score = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null;
};

export default function QuestionBankDetail({ item, onClose, onOpenQuestion, onPatchClassification, inline = false }: QuestionBankDetailProps) {
  const [unit, setUnit] = useState("");
  const [subunit, setSubunit] = useState("");
  const [concepts, setConcepts] = useState("");
  const [tags, setTags] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [importance, setImportance] = useState("");
  const [quality, setQuality] = useState("");
  const [answerType, setAnswerType] = useState<QuestionAnswerType>("unknown");
  const [sourceType, setSourceType] = useState<ProblemSourceType>("unknown");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasFailedPatch, setHasFailedPatch] = useState(false);
  const failedPatchRef = useRef<QuestionMetaPatch | null>(null);

  useEffect(() => {
    setUnit(item?.classification.unit ?? "");
    setSubunit(item?.classification.subunit ?? "");
    setConcepts((item?.classification.concepts ?? []).join(", "));
    setTags((item?.classification.tags ?? []).join(", "));
    setDifficulty(item?.classification.difficultyScore?.toString() ?? "");
    setImportance(item?.classification.importanceScore?.toString() ?? "");
    setQuality(item?.classification.qualityScore?.toString() ?? "");
    setAnswerType(item?.classification.answerType ?? "unknown");
    setSourceType(item?.classification.sourceType ?? item?.source.type ?? "unknown");
    failedPatchRef.current = null;
    setHasFailedPatch(false);
    setSaveError(null);
  }, [item]);

  const makePatch = (): QuestionMetaPatch => ({
    difficultyScore: score(difficulty),
    importanceScore: score(importance),
    qualityScore: score(quality),
    classification: {
      ...(item?.classification ?? {}),
      unit: unit.trim() || undefined,
      subunit: subunit.trim() || undefined,
      concepts: list(concepts),
      tags: list(tags),
      answerType,
      sourceType,
    },
  });

  const saveClassification = async (patch = makePatch()) => {
    if (!item || !onPatchClassification) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onPatchClassification(item.entryId, item.questionNumber, patch);
      failedPatchRef.current = null;
      setHasFailedPatch(false);
    } catch (error) {
      failedPatchRef.current = patch;
      setHasFailedPatch(true);
      setSaveError(error instanceof Error ? error.message : "문항 분류를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const content = item && <div className="question-bank-detail">
      <div className="question-bank-card__chips"><span>{PROBLEM_SOURCE_LABELS[item.source.type]}</span><span>{item.subject}</span>{item.classification.unit && <span>{item.classification.unit}</span>}{item.classification.subunit && <span>{item.classification.subunit}</span>}</div>
      <pre className="question-bank-detail__question"><MathText text={normalizeLegacyMathCommandsForDisplay(item.questionText)} /></pre>
      <dl><div><dt>난이도</dt><dd>{difficultyScoreLabel(item.classification.difficultyScore)}</dd></div><div><dt>중요도</dt><dd>{item.classification.importanceScore !== undefined && item.classification.importanceScore !== null ? `${Math.ceil(item.classification.importanceScore / 20)}/5` : "미지정"}</dd></div><div><dt>품질</dt><dd>{item.classification.qualityScore ?? "미지정"}</dd></div><div><dt>답 유형</dt><dd>{answerTypeLabel[item.classification.answerType ?? "unknown"]}</dd></div></dl>
      <section><h4>정답</h4><p><MathText text={normalizeLegacyMathCommandsForDisplay(item.answer ?? "연결되지 않음")} /></p></section>
      <section><h4>해설</h4><p><MathText text={normalizeLegacyMathCommandsForDisplay(item.explanation ?? "연결되지 않음")} /></p></section>
      {onPatchClassification && <section className="question-bank-detail__classification"><h4>분류 편집</h4>
        <label>난이도 (0-100)<input type="number" min="0" max="100" value={difficulty} onChange={(event) => setDifficulty(event.target.value)} /></label>
        <label>중요도 (0-100)<input type="number" min="0" max="100" value={importance} onChange={(event) => setImportance(event.target.value)} /></label>
        <label>품질 (0-100)<input type="number" min="0" max="100" value={quality} onChange={(event) => setQuality(event.target.value)} /></label>
        <label>답 유형<select value={answerType} onChange={(event) => setAnswerType(event.target.value as QuestionAnswerType)}>{Object.entries(answerTypeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>출처 유형<select value={sourceType} onChange={(event) => setSourceType(event.target.value as ProblemSourceType)}>{Object.entries(PROBLEM_SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>단원<input value={unit} onChange={(event) => setUnit(event.target.value)} /></label><label>소단원<input value={subunit} onChange={(event) => setSubunit(event.target.value)} /></label><label>개념 (쉼표)<input value={concepts} onChange={(event) => setConcepts(event.target.value)} /></label><label>태그 (쉼표)<input value={tags} onChange={(event) => setTags(event.target.value)} /></label>
        {saveError && <p className="form-error" role="alert">{saveError}<button type="button" className="btn-secondary" onClick={() => { const failed = failedPatchRef.current; if (failed) void saveClassification(failed); }} disabled={saving || !hasFailedPatch}>다시 저장</button></p>}
        <button type="button" className="btn-secondary" onClick={() => void saveClassification()} disabled={saving}>{saving ? "저장 중..." : "분류 저장"}</button>
      </section>}
      <footer className="dialog-actions"><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>닫기</button><button type="button" onClick={() => { onOpenQuestion(item); onClose(); }} disabled={saving}>문제 열기</button></footer>
    </div>;
  if (inline) return content ? <aside className="question-bank-inspector" aria-label="문항 검사기">{content}</aside> : null;
  return <Dialog open={Boolean(item)} onClose={onClose} title={item ? `${item.entryTitle} ${item.questionNumber}번` : "문항 상세"} ariaLabel="문제 은행 문항 상세" closeDisabled={saving} busy={saving}>{content}</Dialog>;
}
