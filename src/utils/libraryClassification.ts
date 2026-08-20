import type {
  LibraryResourceType,
  LearningResourceClassification,
  ProblemSourceType,
  WrongAnswerEntry,
} from "../types";
import type { LibraryPreferences } from "../types";

const RESOURCE_TYPES = new Set<LibraryResourceType>([
  "past_collection",
  "official_exam",
  "official_mock",
  "education_office_mock",
  "nset",
  "problem_set",
  "private_mock",
  "lecture",
  "other",
]);

export const LIBRARY_RESOURCE_TYPE_LABELS: Record<LibraryResourceType, string> = {
  past_collection: "기출",
  official_exam: "공식 시험",
  official_mock: "공식 모의고사",
  education_office_mock: "교육청 모의고사",
  nset: "N제",
  problem_set: "문제 세트",
  private_mock: "사설 모의고사",
  lecture: "특강",
  other: "미분류",
};

export const DEFAULT_LIBRARY_PREFERENCES: LibraryPreferences = {
  separateMockExams: false,
  defaultUnitView: "home",
  listDensity: "standard",
  showUserFolders: true,
};

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function textList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = [...new Set(value.map(text).filter((item): item is string => Boolean(item)))];
  return result.length ? result : undefined;
}

function resourceType(value: unknown): LibraryResourceType | undefined {
  return typeof value === "string" && RESOURCE_TYPES.has(value as LibraryResourceType)
    ? value as LibraryResourceType
    : undefined;
}

export function normalizeLearningResourceClassification(
  raw: unknown,
): LearningResourceClassification | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  const normalized: LearningResourceClassification = {
    subject: text(value.subject),
    course: text(value.course),
    majorUnit: text(value.majorUnit),
    unit: text(value.unit),
    subunit: text(value.subunit),
    conceptIds: textList(value.conceptIds),
    resourceType: resourceType(value.resourceType),
  };
  return Object.values(normalized).some((item) => item !== undefined) ? normalized : undefined;
}

export function normalizeLibraryPreferences(raw: unknown): LibraryPreferences {
  const value = raw && typeof raw === "object" ? raw as Partial<LibraryPreferences> : {};
  return {
    separateMockExams: value.separateMockExams === true,
    defaultUnitView: value.defaultUnitView === "lectures" || value.defaultUnitView === "problems"
      ? value.defaultUnitView
      : DEFAULT_LIBRARY_PREFERENCES.defaultUnitView,
    listDensity: value.listDensity === "compact" ? "compact" : DEFAULT_LIBRARY_PREFERENCES.listDensity,
    showUserFolders: value.showUserFolders !== false,
  };
}

export function resourceTypeLabel(type: LibraryResourceType): string {
  return LIBRARY_RESOURCE_TYPE_LABELS[type] ?? LIBRARY_RESOURCE_TYPE_LABELS.other;
}

function sourceToResourceType(entry: WrongAnswerEntry): LibraryResourceType {
  if (entry.entryKind === "lecture") return "lecture";
  const source = entry.problemSource;
  const sourceType: ProblemSourceType | undefined = source?.type;
  switch (sourceType) {
    case "past_exam": return "past_collection";
    case "n_series": return "nset";
    case "worksheet":
    case "textbook": return "problem_set";
    case "mock_exam":
      if (source?.organization?.includes("교육청")) return "education_office_mock";
      return source?.isOfficial ? "official_mock" : "private_mock";
    case "school_exam": return "official_exam";
    case "self_made": return "private_mock";
    default: return "other";
  }
}

export interface ResolvedLearningResourceClassification extends LearningResourceClassification {
  subject: string;
  resourceType: LibraryResourceType;
  hasExplicitMetadata: boolean;
}

/** Resolves display-only fallbacks without returning a value intended for persistence. */
export function resolveLearningResourceClassification(
  entry: WrongAnswerEntry,
): ResolvedLearningResourceClassification {
  const explicit = entry.resourceClassification;
  const resourceType = explicit?.resourceType ?? sourceToResourceType(entry);
  return {
    ...explicit,
    subject: explicit?.subject ?? text(entry.subject) ?? "미분류",
    resourceType,
    hasExplicitMetadata: Boolean(explicit),
  };
}

export type LibraryResourceGroup = "기출" | "N제" | "모의고사" | "특강" | "문제" | "미분류";

/** Returns the navigation label only; it does not mutate the entry's source classification. */
export function getLibraryResourceGroup(
  entry: WrongAnswerEntry,
  preferences: Pick<LibraryPreferences, "separateMockExams"> = DEFAULT_LIBRARY_PREFERENCES,
): LibraryResourceGroup {
  const type = resolveLearningResourceClassification(entry).resourceType;
  if (type === "lecture") return "특강";
  if (type === "past_collection" || type === "official_exam") return "기출";
  if (type === "nset" || type === "problem_set") return "N제";
  if (type === "official_mock" || type === "education_office_mock" || type === "private_mock") {
    return preferences.separateMockExams
      ? "모의고사"
      : type === "private_mock" ? "N제" : "기출";
  }
  return "미분류";
}

export interface LibraryResourceProjection {
  entry: WrongAnswerEntry;
  classification: ResolvedLearningResourceClassification;
  group: LibraryResourceGroup;
}

export function projectLibraryResource(
  entry: WrongAnswerEntry,
  preferences?: Partial<LibraryPreferences>,
): LibraryResourceProjection {
  const normalizedPreferences = normalizeLibraryPreferences(preferences);
  return {
    entry,
    classification: resolveLearningResourceClassification(entry),
    group: getLibraryResourceGroup(entry, normalizedPreferences),
  };
}
