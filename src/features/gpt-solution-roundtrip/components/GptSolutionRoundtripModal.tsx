import { useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { LearningBlock, SheetAnswerItem, WrongAnswerEntry } from "../../../types";
import type { ChatGptSharePayload } from "../../export/types";
import Dialog from "../../../shared/ui/Dialog";
import { normalizeQuestionNumber } from "../../../utils/questionMeta";
import type { GptSolutionPurpose } from "../../export/components/ChatGptSharePanel";

type IncomingSolution = {
  questionNumber: string;
  answer?: string;
  strategy?: string;
  steps?: string[];
  explanation?: string;
  concepts?: string[];
  wrongPoint?: string;
  reviewPoint?: string;
  learningBlocks?: Array<Partial<LearningBlock>>;
};

type IncomingResponse = {
  entryId?: string;
  questionNumbers?: string[];
  solutions?: IncomingSolution[];
};

type FieldMode = "keep" | "incoming" | "fill";
const FIELDS = ["answer", "strategy", "steps", "explanation", "concepts", "wrongPoint", "reviewPoint"] as const;
type Field = (typeof FIELDS)[number];

export interface GptSolutionRoundtripModalProps {
  entry: WrongAnswerEntry;
  purpose: GptSolutionPurpose;
  questionNumbers: string[];
  payload: ChatGptSharePayload;
  onClose: () => void;
  onApply: (patch: Pick<WrongAnswerEntry, "answerKey" | "learningBlocks">) => Promise<void>;
  onImportedResponse?: (raw: string) => Promise<void>;
  onApplied?: () => Promise<void>;
}

function purposeLabel(purpose: GptSolutionPurpose): string {
  return ({ hint: "힌트", full_solution: "완전한 해설", wrong_answer_analysis: "오답 분석", lecture: "특강형 정리", solution_and_lecture: "해설과 특강 모두" } satisfies Record<GptSolutionPurpose, string>)[purpose];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function asTexts(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : undefined;
}

function parseResponse(raw: string): { response?: IncomingResponse; error?: string } {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return { error: "응답은 JSON 객체여야 합니다." };
    const rawSolutions = Array.isArray(parsed.solutions) ? parsed.solutions : [];
    return {
      response: {
        entryId: asText(parsed.entryId),
        questionNumbers: asTexts(parsed.questionNumbers),
        solutions: rawSolutions.flatMap((item) => {
          if (!isObject(item) || !asText(item.questionNumber)) return [];
          return [{
            questionNumber: asText(item.questionNumber)!, answer: asText(item.answer), strategy: asText(item.strategy),
            steps: asTexts(item.steps), explanation: asText(item.explanation), concepts: asTexts(item.concepts),
            wrongPoint: asText(item.wrongPoint), reviewPoint: asText(item.reviewPoint),
            learningBlocks: Array.isArray(item.learningBlocks) ? item.learningBlocks.filter(isObject).map((block) => ({
              type: asText(block.type) as LearningBlock["type"] | undefined,
              title: asText(block.title), content: asText(block.content), sourceQuestionNumber: asText(block.sourceQuestionNumber),
            })) : undefined,
          }];
        }),
      },
    };
  } catch {
    return { error: "JSON 형식을 읽지 못했습니다." };
  }
}

function valueFor(item: SheetAnswerItem | undefined, field: Field): unknown {
  return item?.[field];
}

function hasValue(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

export default function GptSolutionRoundtripModal({ entry, purpose, questionNumbers, payload, onClose, onApply, onImportedResponse, onApplied }: GptSolutionRoundtripModalProps) {
  const [raw, setRaw] = useState("");
  const [response, setResponse] = useState<IncomingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldModes, setFieldModes] = useState<Record<string, FieldMode>>({});
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const requested = useMemo(() => new Set(questionNumbers.map(normalizeQuestionNumber)), [questionNumbers]);
  const parsedSolutions = useMemo(() => response?.solutions ?? [], [response]);
  const duplicate = useMemo(() => {
    const seen = new Set<string>();
    return parsedSolutions.some((solution) => {
      const key = normalizeQuestionNumber(solution.questionNumber);
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });
  }, [parsedSolutions]);
  const applicable = useMemo(() => parsedSolutions.filter((solution) => requested.has(normalizeQuestionNumber(solution.questionNumber))), [parsedSolutions, requested]);
  const ignored = useMemo(() => parsedSolutions.filter((solution) => !requested.has(normalizeQuestionNumber(solution.questionNumber))), [parsedSolutions, requested]);

  const readClipboard = async () => {
    try { setRaw(await navigator.clipboard.readText()); setResponse(null); setError(null); }
    catch { setError("클립보드를 읽지 못했습니다."); }
  };
  const parse = () => {
    const result = parseResponse(raw);
    if (result.error || !result.response) { setError(result.error ?? "응답을 읽지 못했습니다."); return; }
    if (result.response.entryId && result.response.entryId !== entry.id) { setError("응답의 entryId가 현재 문제지와 다릅니다."); return; }
    if (result.response.questionNumbers?.some((number) => !requested.has(normalizeQuestionNumber(number)))) { setError("응답 questionNumbers에 요청하지 않은 문항이 포함되어 있습니다."); return; }
    setResponse(result.response); setError(null);
    void onImportedResponse?.(raw).catch((saveError) => setError(saveError instanceof Error ? saveError.message : "GPT 응답 초안을 저장하지 못했습니다."));
  };
  const loadFile = async (file?: File) => {
    if (!file) return;
    setRaw(await file.text()); setResponse(null); setError(null);
  };
  const apply = async () => {
    if (!response || duplicate || !applicable.length) return;
    setSaving(true); setError(null);
    try {
      const answers: SheetAnswerItem[] = (entry.answerKey ?? []).map((item) => ({ ...item, importantPoints: [...item.importantPoints], ...(item.steps ? { steps: [...item.steps] } : {}), ...(item.concepts ? { concepts: [...item.concepts] } : {}) }));
      const blocks = [...(entry.learningBlocks ?? [])];
      for (const solution of applicable) {
        const number = normalizeQuestionNumber(solution.questionNumber);
        if (!approved[number]) continue;
        const index = answers.findIndex((item) => normalizeQuestionNumber(item.questionNumber) === number);
        const current = index >= 0 ? answers[index] : { id: uuidv4(), questionNumber: number, answer: "", explanation: "", importantPoints: [] } as SheetAnswerItem;
        const next: SheetAnswerItem = { ...current };
        for (const field of FIELDS) {
          const incoming = solution[field];
          if (incoming === undefined) continue;
          const mode = fieldModes[`${number}:${field}`] ?? "keep";
          if (mode === "incoming" || (mode === "fill" && !hasValue(valueFor(current, field)))) {
            Object.assign(next, { [field]: Array.isArray(incoming) ? [...incoming] : incoming });
          }
        }
        if (index >= 0) answers[index] = next; else answers.push(next);
        for (const block of solution.learningBlocks ?? []) {
          if (!block.type || !block.title || !block.content) continue;
          const candidate: LearningBlock = { id: uuidv4(), type: block.type, title: block.title, content: block.content, sourceQuestionNumber: number };
          if (!blocks.some((existing) => normalizeQuestionNumber(existing.sourceQuestionNumber ?? "") === number && existing.type === candidate.type && existing.title.trim() === candidate.title.trim() && existing.content.trim() === candidate.content.trim())) blocks.push(candidate);
        }
      }
      await onApply({ answerKey: answers, learningBlocks: blocks });
      await onApplied?.();
      onClose();
    } catch (applyError) { setError(applyError instanceof Error ? applyError.message : "해설을 저장하지 못했습니다."); }
    finally { setSaving(false); }
  };
  return <Dialog open onClose={onClose} ariaLabel="선택 문항 GPT 해설 검토" className="form-modal form-modal--wide" closeDisabled={saving} busy={saving}>
    <header className="form-header"><div><h2>선택 문항 GPT 해설</h2><p>{purposeLabel(purpose)} · {questionNumbers.join(", ")}번</p></div><button type="button" className="btn-icon" aria-label="GPT 해설 검토 닫기" onClick={onClose} disabled={saving}>닫기</button></header>
    <div className="form-body"><p className="form-hint">요청 snapshot {payload.questions.length}개 문항만 적용할 수 있습니다. 기존 값은 기본적으로 유지됩니다.</p>
      <textarea className="import-textarea" value={raw} onChange={(event) => { setRaw(event.target.value); setResponse(null); }} placeholder="ChatGPT 응답 JSON을 붙여넣으세요." />
      <div className="form-row"><button type="button" className="btn-secondary" onClick={() => void readClipboard()}>클립보드에서 가져오기</button><label className="btn-secondary">JSON 파일 가져오기<input hidden type="file" accept="application/json,.json" onChange={(event) => void loadFile(event.target.files?.[0])} /></label><button type="button" className="btn-primary" onClick={parse}>응답 검토</button></div>
      {error ? <p className="form-save-error" role="alert">{error}</p> : null}
      {duplicate ? <p className="form-save-error">중복 문항 번호가 있어 저장할 수 없습니다.</p> : null}
      {ignored.length ? <p className="form-hint">요청하지 않은 {ignored.map((item) => item.questionNumber).join(", ")}번 결과는 폐기됩니다.</p> : null}
      {applicable.map((solution) => { const number = normalizeQuestionNumber(solution.questionNumber); const existing = entry.answerKey?.find((item) => normalizeQuestionNumber(item.questionNumber) === number); return <section key={number} className="import-answer-preview"><label><input type="checkbox" checked={approved[number] ?? false} onChange={(event) => setApproved((current) => ({ ...current, [number]: event.target.checked }))} /> {number}번 적용 승인</label><p>기존 정답: {existing?.answer || "없음"} · 새 정답: {solution.answer || "없음"}</p>{FIELDS.filter((field) => solution[field] !== undefined).map((field) => <label key={field}>{field}<select value={fieldModes[`${number}:${field}`] ?? "keep"} onChange={(event) => setFieldModes((current) => ({ ...current, [`${number}:${field}`]: event.target.value as FieldMode }))}><option value="keep">기존 유지</option><option value="incoming">새 값 사용</option><option value="fill">빈 필드만 채우기</option></select></label>)}</section>; })}
    </div>
    <footer className="form-footer"><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>취소</button><button type="button" className="btn-primary" disabled={saving || duplicate || !applicable.some((solution) => approved[normalizeQuestionNumber(solution.questionNumber)])} onClick={() => void apply()}>{saving ? "저장 중..." : "승인한 문항 저장"}</button></footer>
  </Dialog>;
}
