import { v4 as uuidv4 } from "uuid";
import type { EntryFormData, EntryKind, WrongAnswerEntry } from "../../../types";

export type EntryDraft = EntryFormData;

const clone = <T,>(value: T): T => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const emptyExplanationPart = () => ({ id: uuidv4(), text: "", images: [] as string[] });

export function createEmptyEntryDraft(entryKind: EntryKind = "wrong_answer"): EntryDraft {
  return {
    subject: "수학",
    generatedFromExamSessionId: undefined,
    generatedFromQuestionNumber: undefined,
    title: "",
    question: "",
    questionImages: [],
    sourcePageImages: [],
    problemSource: undefined,
    entryKind,
    difficult: false,
    difficulty: "none",
    difficultyScore: undefined,
    myAnswer: "",
    correctAnswer: "",
    explanationParts: [emptyExplanationPart()],
    memo: "",
    annotations: [],
    tags: [],
    answerKey: [],
    figures: [],
    questionMeta: [],
    sheetGroup: undefined,
    importAudit: undefined,
    rejectedNotes: [],
    mistakeAnalysis: { causes: [] },
    review: undefined,
    reviewAttempts: [],
    checklist: [],
    learningBlocks: [],
    sourceType: undefined,
    linkedEntryIds: [],
    supplementalResources: [],
    concepts: [],
    mastered: false,
  };
}

export function createEntryDraftFromEntry(entry: WrongAnswerEntry): EntryDraft {
  const draft = clone(entry) as Partial<WrongAnswerEntry>;
  delete draft.id;
  delete draft.createdAt;
  delete draft.updatedAt;
  return mergeEntryDraft(draft, createEmptyEntryDraft(entry.entryKind));
}

export function mergeEntryDraft(
  initialData: Partial<EntryFormData> | undefined,
  defaults: EntryDraft = createEmptyEntryDraft(initialData?.entryKind ?? "wrong_answer"),
): EntryDraft {
  return clone({ ...defaults, ...(initialData ?? {}) });
}

export function cloneEntryDraft(draft: EntryDraft): EntryDraft {
  return clone(draft);
}

export function normalizeEntryDraftForSave(draft: Partial<EntryFormData>): EntryDraft {
  const merged = mergeEntryDraft(draft, createEmptyEntryDraft(draft.entryKind ?? "wrong_answer"));
  return {
    ...merged,
    generatedFromExamSessionId: typeof merged.generatedFromExamSessionId === "string" && merged.generatedFromExamSessionId.trim()
      ? merged.generatedFromExamSessionId.trim()
      : undefined,
    generatedFromQuestionNumber: typeof merged.generatedFromQuestionNumber === "string" && merged.generatedFromQuestionNumber.trim()
      ? merged.generatedFromQuestionNumber.trim()
      : undefined,
    explanationParts: merged.explanationParts.length ? merged.explanationParts : [emptyExplanationPart()],
    tags: [...merged.tags],
    questionImages: [...merged.questionImages],
    sourcePageImages: [...(merged.sourcePageImages ?? [])],
    problemSource: merged.problemSource ? clone(merged.problemSource) : undefined,
    answerKey: clone(merged.answerKey ?? []),
    figures: clone(merged.figures ?? []),
    questionMeta: clone(merged.questionMeta ?? []),
    learningBlocks: clone(merged.learningBlocks ?? []),
    checklist: clone(merged.checklist ?? []),
    rejectedNotes: [...(merged.rejectedNotes ?? [])],
    linkedEntryIds: [...(merged.linkedEntryIds ?? [])],
    supplementalResources: clone(merged.supplementalResources ?? []),
    concepts: [...(merged.concepts ?? [])],
  };
}
