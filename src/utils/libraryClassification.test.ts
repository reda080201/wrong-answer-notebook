import { describe, expect, it } from "vitest";
import type { WrongAnswerEntry } from "../types";
import {
  DEFAULT_LIBRARY_PREFERENCES,
  getLibraryResourceGroup,
  normalizeLearningResourceClassification,
  normalizeLibraryPreferences,
  projectLibraryResource,
  resolveLearningResourceClassification,
} from "./libraryClassification";

function entry(partial: Partial<WrongAnswerEntry> = {}): WrongAnswerEntry {
  return {
    id: "entry-1",
    subject: "수학",
    title: "자료",
    question: "문제",
    questionImages: [],
    entryKind: "problem_sheet",
    difficult: false,
    myAnswer: "",
    correctAnswer: "",
    explanationParts: [],
    memo: "",
    annotations: [],
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    mastered: false,
    ...partial,
  };
}

describe("library classification model", () => {
  it("normalizes optional metadata without inventing values", () => {
    expect(normalizeLearningResourceClassification({
      subject: " 수학 ",
      unit: " 미분 ",
      conceptIds: ["c1", " c1 ", "", 3],
      resourceType: "private_mock",
      ignored: "not persisted by the normalizer",
    })).toEqual({
      subject: "수학",
      unit: "미분",
      conceptIds: ["c1"],
      resourceType: "private_mock",
    });
    expect(normalizeLearningResourceClassification({ resourceType: "not-real" })).toBeUndefined();
  });

  it("normalizes legacy and invalid library preferences safely", () => {
    expect(normalizeLibraryPreferences(undefined)).toEqual(DEFAULT_LIBRARY_PREFERENCES);
    expect(normalizeLibraryPreferences({
      separateMockExams: "true",
      defaultUnitView: "invalid",
      listDensity: "compact",
      showUserFolders: false,
    })).toEqual({
      separateMockExams: false,
      defaultUnitView: "home",
      listDensity: "compact",
      showUserFolders: false,
    });
  });

  it("uses legacy source fields for display-only fallback", () => {
    const legacy = entry({ problemSource: { type: "n_series" } });
    const projection = projectLibraryResource(legacy);
    expect(projection.classification).toMatchObject({
      subject: "수학",
      resourceType: "nset",
      hasExplicitMetadata: false,
    });
    expect(projection.group).toBe("N제");
    expect(legacy.resourceClassification).toBeUndefined();
  });

  it("keeps metadata-free entries visible as unclassified", () => {
    const legacy = entry({ subject: "" });
    expect(resolveLearningResourceClassification(legacy)).toMatchObject({
      subject: "미분류",
      resourceType: "other",
      hasExplicitMetadata: false,
    });
    expect(getLibraryResourceGroup(legacy)).toBe("미분류");
  });

  it("groups official and private mocks according to the display preference", () => {
    const official = entry({ resourceClassification: { resourceType: "official_mock" } });
    const privateMock = entry({ resourceClassification: { resourceType: "private_mock" } });

    expect(getLibraryResourceGroup(official)).toBe("기출");
    expect(getLibraryResourceGroup(privateMock)).toBe("N제");
    expect(getLibraryResourceGroup(official, { separateMockExams: true })).toBe("모의고사");
    expect(getLibraryResourceGroup(privateMock, { separateMockExams: true })).toBe("모의고사");
    expect(official.resourceClassification?.resourceType).toBe("official_mock");
  });

  it("maps lectures independently from problem resources", () => {
    expect(getLibraryResourceGroup(entry({ entryKind: "lecture" }))).toBe("특강");
  });
});
