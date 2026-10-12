type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => value !== null && typeof value === "object" && !Array.isArray(value);
const records = (value: unknown): value is RecordValue[] => Array.isArray(value) && value.every(record);
const strings = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === "string");
const imageLists = new Set(["images", "questionImages", "explanationImages", "sourcePageImages", "selectedSourcePageImages", "linkedSourcePageImages", "imageReferences", "questionImageAssets", "sourcePageAssets"]);
const objectLists = new Set(["questions", "structuredQuestions", "figures", "solutionFigures", "learningBlocks", "explanationParts", "questionSourceCrops", "questionSolutionHotspots", "contentSegments", "groups", "assets", "preparedEntries"]);

/** Validate before normalization/filtering: dropped malformed containers can hide references. */
export function hasSafeImageReferenceShape(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(hasSafeImageReferenceShape);
  if (!record(value)) return true;
  return Object.entries(value).every(([key, child]) => {
    if (imageLists.has(key) && !strings(child)) return false;
    if (objectLists.has(key) && !records(child)) return false;
    if (["image", "filename", "stagedFilename", "sourcePageImage", "renderedQuestionPng"].includes(key) && child !== null && typeof child !== "string") return false;
    if (["sourceToSaved", "sourceToStaged"].includes(key) && (!record(child) || !Object.values(child).every(value => typeof value === "string"))) return false;
    if (key === "questionContentSegments" && (!record(child) || !Object.values(child).every(records))) return false;
    if ((key === "questionSnapshot" || key === "entry" || key === "commitAttempt" || key === "assetSession") && !record(child)) return false;
    return hasSafeImageReferenceShape(child);
  });
}

export function assertImageReferenceStore(value: unknown, kind: "entries" | "exam" | "generated" | "gpt" | "workspace" | "pending"): void {
  let valid = false;
  if (kind === "workspace") {
    valid = value === null || (record(value) && records(value.groups) && records(value.assets)
      && value.groups.every(group => records(group.questions)));
  } else if (kind === "entries") {
    const items = Array.isArray(value) ? value : record(value) ? value.entries : undefined;
    valid = records(items);
  } else if (records(value)) {
    valid = value.every(item => {
      if (kind === "exam" || kind === "generated") return records(item.questions);
      if (kind === "gpt") return record(item.questionSnapshot) && records(item.questionSnapshot.questions);
      return strings(item.imageReferences);
    });
  }
  if (!valid || !hasSafeImageReferenceShape(value)) throw new Error("저장된 이미지 참조 구조가 올바르지 않습니다. 데이터를 확인한 뒤 다시 시도하세요.");
}
