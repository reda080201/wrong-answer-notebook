import { useEffect, useRef, useState } from "react";
import MathText from "../../../components/MathText";
import QuestionContentView from "../../../components/QuestionContentView";
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

const fieldLabels: Record<string, string> = { unit: "단원", subunit: "소단원", concepts: "개념", tags: "태그", difficulty: "난이도", importance: "중요도", quality: "품질", answerType: "답 유형", sourceType: "출처 유형" };

const list = (value: string) => value.split(",").map((part) => part.trim()).filter(Boolean);
const score = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null;
};

export default function QuestionBankDetail({ item, onClose, onOpenQuestion, onPatchClassification, inline = false }: QuestionBankDetailProps) {
  return <QuestionBankDetailFields key={item?.id ?? "empty"} item={item} onClose={onClose} onOpenQuestion={onOpenQuestion} onPatchClassification={onPatchClassification} inline={inline} />;
}

function QuestionBankDetailFields({ item, onClose, onOpenQuestion, onPatchClassification, inline = false }: QuestionBankDetailProps) {
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
  const [classificationOpen, setClassificationOpen] = useState(false);
  const failedPatchRef = useRef<QuestionMetaPatch | null>(null);
  const baseline = useRef<Record<string, string>>({});
  const [conflicts, setConflicts] = useState<string[]>([]);

  useEffect(() => {
    const incoming = { unit: item?.classification.unit ?? "", subunit: item?.classification.subunit ?? "", concepts: (item?.classification.concepts ?? []).join(", "), tags: (item?.classification.tags ?? []).join(", "), difficulty: item?.classification.difficultyScore?.toString() ?? "", importance: item?.classification.importanceScore?.toString() ?? "", quality: item?.classification.qualityScore?.toString() ?? "", answerType: item?.classification.answerType ?? "unknown", sourceType: item?.classification.sourceType ?? item?.source.type ?? "unknown" };
    const current = { unit, subunit, concepts, tags, difficulty, importance, quality, answerType, sourceType };
    const changed: string[] = [];
    const sync = <T extends string,>(key: keyof typeof incoming, value: T, setter: (value: T) => void) => {
      const previous = baseline.current[key];
      if (previous === undefined || current[key] === previous) {
        setter(value);
        baseline.current[key] = value;
      } else if (value !== previous && value !== current[key]) changed.push(key);
    };
    sync("unit", incoming.unit, setUnit); sync("subunit", incoming.subunit, setSubunit);
    sync("concepts", incoming.concepts, setConcepts); sync("tags", incoming.tags, setTags);
    sync("difficulty", incoming.difficulty, setDifficulty); sync("importance", incoming.importance, setImportance);
    sync("quality", incoming.quality, setQuality); sync("answerType", incoming.answerType, setAnswerType);
    sync("sourceType", incoming.sourceType, setSourceType);
    setConflicts(previous => previous.length === changed.length && previous.every((key, index) => key === changed[index]) ? previous : changed);
  }, [item, unit, subunit, concepts, tags, difficulty, importance, quality, answerType, sourceType]);

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
      baseline.current = { unit: patch.classification?.unit ?? "", subunit: patch.classification?.subunit ?? "", concepts: (patch.classification?.concepts ?? []).join(", "), tags: (patch.classification?.tags ?? []).join(", "), difficulty: patch.difficultyScore?.toString() ?? "", importance: patch.importanceScore?.toString() ?? "", quality: patch.qualityScore?.toString() ?? "", answerType: patch.classification?.answerType ?? "unknown", sourceType: patch.classification?.sourceType ?? "unknown" };
      setConflicts([]);
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

  const metricRows = item ? [
    item.classification.difficultyScore !== undefined && item.classification.difficultyScore !== null ? ["난이도", difficultyScoreLabel(item.classification.difficultyScore)] : null,
    item.classification.importanceScore !== undefined && item.classification.importanceScore !== null ? ["중요도", `${Math.ceil(item.classification.importanceScore / 20)}/5`] : null,
    item.classification.qualityScore !== undefined && item.classification.qualityScore !== null ? ["품질", item.classification.qualityScore] : null,
    item.classification.answerType && item.classification.answerType !== "unknown" ? ["답 유형", answerTypeLabel[item.classification.answerType]] : null,
  ].filter((row): row is [string, string | number] => row !== null) : [];

  const content = item && <div className="question-bank-detail">
      <div className="question-bank-card__chips"><span>{PROBLEM_SOURCE_LABELS[item.source.type]}</span><span>{item.subject}</span>{item.classification.unit && <span>{item.classification.unit}</span>}{item.classification.subunit && <span>{item.classification.subunit}</span>}</div>
      {item.presentation?.passage && <section className="exam-passage"><QuestionContentView text={item.presentation.passage} figures={item.presentation.figures} appendUnreferencedFigures={false} /></section>}
      {item.presentation ? <QuestionContentView referencedPassage={item.presentation.passage} {...item.presentation} appendUnreferencedFigures={false} /> : <pre className="question-bank-detail__question"><MathText text={normalizeLegacyMathCommandsForDisplay(item.questionText)} /></pre>}

      {metricRows.length ? <dl>{metricRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : <p className="question-bank-detail__empty-metrics">평가 정보 없음</p>}
      <section><h4>정답</h4><p><MathText text={normalizeLegacyMathCommandsForDisplay(item.answer ?? "연결되지 않음")} /></p></section>
      <section><h4>해설</h4><p><MathText text={normalizeLegacyMathCommandsForDisplay(item.explanation ?? "연결되지 않음")} /></p></section>
      {onPatchClassification && <section className="question-bank-detail__classification"><button type="button" className="question-bank-classification-toggle" aria-expanded={classificationOpen} onClick={() => setClassificationOpen((open) => !open)}>분류 편집 <span aria-hidden="true">{classificationOpen ? "▴" : "▾"}</span></button>
        {classificationOpen && <div className="question-bank-classification-form">
        <label>난이도 (0-100)<input type="number" min="0" max="100" value={difficulty} onChange={(event) => setDifficulty(event.target.value)} /></label>
        <label>중요도 (0-100)<input type="number" min="0" max="100" value={importance} onChange={(event) => setImportance(event.target.value)} /></label>
        <label>품질 (0-100)<input type="number" min="0" max="100" value={quality} onChange={(event) => setQuality(event.target.value)} /></label>
        <label>답 유형<select value={answerType} onChange={(event) => setAnswerType(event.target.value as QuestionAnswerType)}>{Object.entries(answerTypeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>출처 유형<select value={sourceType} onChange={(event) => setSourceType(event.target.value as ProblemSourceType)}>{Object.entries(PROBLEM_SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>단원<input value={unit} onChange={(event) => setUnit(event.target.value)} /></label><label>소단원<input value={subunit} onChange={(event) => setSubunit(event.target.value)} /></label><label>개념 (쉼표)<input value={concepts} onChange={(event) => setConcepts(event.target.value)} /></label><label>태그 (쉼표)<input value={tags} onChange={(event) => setTags(event.target.value)} /></label>
        {conflicts.length > 0 && <p role="alert">원본도 변경된 항목: {conflicts.map(key => fieldLabels[key] ?? key).join(", ")}. 입력은 유지했습니다. 저장하면 현재 편집값을 적용합니다.</p>}
        {saveError && <p className="form-error" role="alert">{saveError}<button type="button" className="btn-secondary" onClick={() => { const failed = failedPatchRef.current; if (failed) void saveClassification(failed); }} disabled={saving || !hasFailedPatch}>다시 저장</button></p>}
        <button type="button" className="btn-secondary" onClick={() => void saveClassification()} disabled={saving}>{saving ? "저장 중..." : conflicts.length ? "내 편집값으로 저장" : "분류 저장"}</button>
        </div>}
      </section>}
      <footer className="dialog-actions"><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>닫기</button><button type="button" onClick={() => { onOpenQuestion(item); onClose(); }} disabled={saving}>문제 열기</button></footer>
    </div>;
  if (inline) return content ? <aside className="question-bank-inspector" aria-label="문항 검사기">{content}</aside> : null;
  return <Dialog open={Boolean(item)} onClose={onClose} title={item ? `${item.entryTitle} ${item.questionNumber}번` : "문항 상세"} ariaLabel="문제 은행 문항 상세" closeDisabled={saving} busy={saving}>{content}</Dialog>;
}
