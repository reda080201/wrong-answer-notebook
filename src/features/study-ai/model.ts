import type { AiExamConfig } from "./examProposal";
import { hasSafeImageReferenceShape } from "../../services/api/imageReferenceValidation";
import type { ExamQuestionSnapshot, GeneratedExam, QuestionSourceReference, WrongAnswerEntry } from "../../types";
import { createExamQuestionSnapshots } from "../exam/services/examSession";
import { createQuestionSource } from "../exam-builder/services/questionSource";
import { normalizeQuestionNumber } from "../../utils/questionMeta";
import { normalizeQuestionPresentationSegments } from "../../utils/questionPresentation";
import { parseQuestionText } from "../../utils/textLayout";
import { resolveFigureRepresentation } from "../figures/services/figureRepresentation";
export const AI_BACKUP_PREFERENCE_KEY = "wrong-answer-ai-backup-include";
export const AI_STUDY_STORAGE_KEY = "wrong-answer-ai-study-v1";
export interface AiMaterial {
    id: string;
    source: QuestionSourceReference;
    snapshot: ExamQuestionSnapshot;
    difficulty?: number;
    importance?: number;
    units: string[];
    groupMemberIds?: string[];
    memo?: string;
    learning?: unknown;
}
export interface AiSharing {
    body: boolean;
    choices: boolean;
    images: boolean;
    answers: boolean;
    explanations: boolean;
    memo: boolean;
    learning: boolean;
}
export const DEFAULT_AI_SHARING: AiSharing = { body: true, choices: true, images: false, answers: false, explanations: false, memo: false, learning: false };
export interface AiMessage {
    id: string;
    role: "user" | "assistant";
    text: string;
    contextId: string;
    status?: "complete" | "stopped" | "failed";
}
export interface AiConversation {
    id: string;
    title: string;
    updatedAt: string;
    messages: AiMessage[];
    materials: AiMaterial[];
    sharing: AiSharing;
    contextId: string;
    contexts?: Array<{
        id: string;
        materials: AiMaterial[];
        sharing: AiSharing;
    }>;
    proposal?: GeneratedExam;
}
export interface AiExamDraft {
    id: string;
    materials: AiMaterial[];
    sharing: AiSharing;
    config: AiExamConfig;
    proposal?: GeneratedExam;
    excluded: string[];
    template: string;
    filters?: {
        onlyReviewed: boolean;
        requireAnswers: boolean;
        requireExplanations: boolean;
    };
}
export interface AiStudyStore {
    version: 1;
    conversations: AiConversation[];
    drafts?: AiExamDraft[];
}
export const emptyAiStudyStore = (): AiStudyStore => ({ version: 1, conversations: [] });
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(v => typeof v === "string"); }
function validSharing(value: unknown): boolean { return record(value) && Object.keys(DEFAULT_AI_SHARING).every(key => typeof value[key] === "boolean"); }
function validMaterial(value: unknown): boolean {
    if (!record(value) || typeof value.id !== "string" || !record(value.source) || !record(value.snapshot))
        return false;
    const q = value.snapshot;
    if (!hasSafeImageReferenceShape(q))
        return false;
    return typeof value.source.sourceEntryId === "string" && typeof value.source.sourceEntryTitle === "string" && typeof value.source.sourceQuestionNumber === "string" && typeof q.question === "string" && strings(q.choices) && strings(q.questionImages) && Array.isArray(q.figures) && q.figures.every(record) && strings(value.units) && (value.groupMemberIds === undefined || strings(value.groupMemberIds))
        && ["passage", "correctAnswer", "explanation"].every(key => q[key] === undefined || typeof q[key] === "string")
        && ["conditions", "equations"].every(key => q[key] === undefined || strings(q[key]));
}
function validConfig(value:unknown):boolean {
  return record(value) && ["title","subject","instruction"].every(key=>typeof value[key]==="string") && ["count","minutes","points","maxPerSource","easy","medium","hard"].every(key=>typeof value[key]==="number"&&Number.isFinite(value[key])) && typeof value.prioritizeImportance==="boolean" && record(value.unitCounts) && Object.values(value.unitCounts).every(n=>typeof n==="number"&&Number.isFinite(n)&&n>=0);
}
function validProposal(value:unknown):boolean {
  return record(value) && typeof value.id==="string" && typeof value.title==="string" && typeof value.subject==="string" && Array.isArray(value.questions) && value.questions.every(q=>record(q)&&validMaterial({id:"validation",source:q.source,snapshot:q.snapshot,units:[]})&&typeof q.position==="number"&&typeof q.locked==="boolean"&&strings(q.selectionReasons)) && record(value.generationReport) && strings(value.generationReport.warnings);
}
export function isAiStudyStore(value:unknown): value is AiStudyStore {
  return record(value) && value.version===1 && (value.drafts===undefined||(Array.isArray(value.drafts)&&value.drafts.every(d=>record(d)&&typeof d.id==="string"&&Array.isArray(d.materials)&&d.materials.every(validMaterial)&&validSharing(d.sharing)&&validConfig(d.config)&&strings(d.excluded)&&typeof d.template==="string"&&(d.filters===undefined||(record(d.filters)&&["onlyReviewed","requireAnswers","requireExplanations"].every(key=>typeof (d.filters as Record<string,unknown>)[key]==="boolean")))&&(d.proposal===undefined||validProposal(d.proposal))))) && Array.isArray(value.conversations) && value.conversations.every(c=>record(c)&&typeof c.id==="string"&&typeof c.title==="string"&&typeof c.updatedAt==="string"&&typeof c.contextId==="string"&&validSharing(c.sharing)&&Array.isArray(c.materials)&&c.materials.every(validMaterial)&&Array.isArray(c.messages)&&c.messages.every(m=>record(m)&&typeof m.id==="string"&&["user","assistant"].includes(String(m.role))&&typeof m.text==="string"&&typeof m.contextId==="string")&&(c.contexts===undefined||(Array.isArray(c.contexts)&&c.contexts.every(ctx=>record(ctx)&&typeof ctx.id==="string"&&validSharing(ctx.sharing)&&Array.isArray(ctx.materials)&&ctx.materials.every(validMaterial))))&&(c.proposal===undefined||validProposal(c.proposal)));
}
export function entryAiMaterials(entry: WrongAnswerEntry): AiMaterial[] {
    if(entry.entryKind === "concept" || entry.entryKind === "lecture")return [];
    const rawNumbers = (entry.structuredQuestions?.length ? entry.structuredQuestions.map(q => q.questionNumber) : parseQuestionText(entry.question).filter(q => q.kind === "question").map(q => q.kind === "question" ? String(q.numberLabel ?? q.displayNumber) : "")).map(normalizeQuestionNumber);
    const ambiguous = new Set(rawNumbers.filter((n, i) => rawNumbers.indexOf(n) !== i));
    const questions = createExamQuestionSnapshots(entry).filter(q => !ambiguous.has(normalizeQuestionNumber(q.questionNumber)));
    if (!questions.length && !ambiguous.size && entry.entryKind !== "problem_sheet" && entry.question.trim())
        questions.push({ id: `${entry.id}:single`, questionNumber: entry.generatedFromQuestionNumber || "1", question: entry.question, choices: [], figures: structuredClone(entry.figures ?? []), questionImages: [...entry.questionImages], correctAnswer: entry.correctAnswer, explanation: entry.explanationParts.map(p => p.text).join("\n") });
    const counts = new Map<string, number>();
    questions.forEach(q => { const key = normalizeQuestionNumber(q.questionNumber); counts.set(key, (counts.get(key) ?? 0) + 1); });
    return questions.filter(q => counts.get(normalizeQuestionNumber(q.questionNumber)) === 1).map(q => {
        const meta = entry.questionMeta?.find(m => normalizeQuestionNumber(m.questionNumber) === normalizeQuestionNumber(q.questionNumber));
        const answers=(entry.answerKey??[]).filter(a=>normalizeQuestionNumber(a.questionNumber)===normalizeQuestionNumber(q.questionNumber));
        const answer=answers.length===1?answers[0]:undefined;
        return { id: JSON.stringify([entry.id, q.id]), source: q.sourceReference ?? createQuestionSource(entry, q.questionNumber, q), snapshot: { ...structuredClone(q), ...(questions.length === 1 && entry.entryKind !== "problem_sheet" ? { correctAnswer: q.correctAnswer || entry.correctAnswer, explanation: q.explanation || entry.explanationParts.map(p => p.text).join("\n") } : {}) }, groupMemberIds: q.stimulusGroupId ? questions.filter(other => other.stimulusGroupId === q.stimulusGroupId).map(other => JSON.stringify([entry.id, other.id])) : undefined, difficulty: meta?.difficultyScore ?? answer?.difficultyScore ?? (entry.entryKind !== "problem_sheet" ? entry.difficultyScore : undefined), importance: meta?.rating?.importanceScore ?? (meta?.important ? 100 : undefined), units: [...new Set([meta?.classification?.unit,meta?.classification?.subunit,...(meta?.classification?.concepts??[]),...(answer?.concepts??[]),...entry.tags].filter((unit):unit is string=>!!unit))], memo: [meta?.note, entry.memo].filter(Boolean).join("\n"), learning: meta?.review };
    });
}
export function imageNames(materials: AiMaterial[]): string[] {
    return [...new Set(materials.flatMap(m => [...m.snapshot.questionImages, ...m.snapshot.figures.flatMap(f => { const image = resolveFigureRepresentation(f).image; return image ? [image] : []; })]))];
}
/** A whitelist projection: never serialize a full snapshot or source entry to the provider. */
export function projectAiMaterial(m: AiMaterial, sharing: AiSharing) {
    const q = m.snapshot;
    const segments = normalizeQuestionPresentationSegments({ questionText: q.question, conditions: q.conditions ?? [], equations: q.equations ?? [], contentSegments: q.contentSegments });
    return { id: m.id, groupMemberIds: m.groupMemberIds, source: { title: m.source.sourceEntryTitle, number: m.source.sourceQuestionNumber }, difficulty: m.difficulty ?? "미평가", importance: m.importance ?? "미평가", units: m.units,
        ...(sharing.body ? { passage: q.passage, content: segments.filter(s => s.type !== "figure" || sharing.images) } : {}),
        ...(sharing.choices ? { choices: q.choices } : {}),
        ...(sharing.images ? { images: imageNames([m]), figures: q.figures.map(f => ({ id: f.id, title: f.title, caption: f.caption, semanticSpec: f.semanticSpec })) } : {}),
        ...(sharing.answers ? { answer: q.correctAnswer } : {}), ...(sharing.explanations ? { explanation: q.explanation } : {}),
        ...(sharing.memo ? { memo: m.memo } : {}), ...(sharing.learning ? { learning: m.learning } : {}) };
}
export function buildAiContext(materials: AiMaterial[], sharing: AiSharing): {
    text: string;
    images: string[];
} {
    const text = JSON.stringify(materials.map(m => projectAiMaterial(m, sharing)));
    if (new TextEncoder().encode(text).length > 180000)
        throw new Error("자료가 전송 한도를 넘습니다. 문항을 줄이거나 그림·부가 정보를 해제하세요.");
    const images = sharing.images ? imageNames(materials) : [];
    if (images.length > 20)
        throw new Error("그림은 한 번에 최대 20개입니다. 전송할 문항이나 그림 범위를 줄이세요.");
    return { text, images };
}
export function activeContextMessages(c: AiConversation) { return c.messages.filter(m => m.contextId === c.contextId && m.status !== "failed" && m.status !== "stopped").map(m => ({ role: m.role, text: m.text })); }
/** A retry addresses the existing turn, never a new copy of its text. */
export function retryableUserMessage(c: AiConversation) {
    const messages = c.messages.filter(m => m.contextId === c.contextId);
    const target = [...messages].reverse().find(m => m.role === "user");
    const index = target ? messages.indexOf(target) : -1;
    if (index < 0 || messages.slice(index + 1).some(m => m.role === "assistant" && (m.status === "complete" || m.status === undefined))) return undefined;
    return messages[index];
}
export function retryContextMessages(c: AiConversation, messageId: string) {
    const target = retryableUserMessage(c);
    if (!target || target.id !== messageId) throw new Error("현재 문맥에서 실패하거나 중지된 마지막 질문만 재시도할 수 있습니다.");
    const index = c.messages.findIndex(m => m.id === messageId);
    return activeContextMessages({ ...c, messages: c.messages.slice(0, index + 1) });
}
export function changeAiScope(c: AiConversation, materials: AiMaterial[], sharing: AiSharing): AiConversation {
    return { ...c, contexts: [...(c.contexts ?? []), ...(c.messages.some(m => m.contextId === c.contextId) ? [{ id: c.contextId, materials: structuredClone(c.materials), sharing: { ...c.sharing } }] : [])], materials: structuredClone(materials), sharing: { ...sharing }, contextId: crypto.randomUUID(), updatedAt: new Date().toISOString(), proposal: undefined };
}
