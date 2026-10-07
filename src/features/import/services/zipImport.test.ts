import { validPngBytes } from "../../../test/fixtures/validPng";
import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { readZipImport, safeImportAssetPath, validateImportAssetReferences } from "./zipImport";
import { createKangdaeK7SyntheticImport } from "../../../test/fixtures/kangdaeK7Synthetic";
import { parseAllInOneImport } from "../../../utils/importStudyText";
import { normalizeEntry } from "../../../utils/entry";
import { getEntryQuestions } from "../../../utils/entryQuestions";
import { createExamSession } from "../../exam/services/examSession";
import type { WrongAnswerEntry } from "../../../types";

vi.mock("./validateImportImage", () => ({ validateImportImage: vi.fn().mockResolvedValue(undefined) }));

describe("readZipImport asset names", () => {
  it("rejects declared paths before malformed representations can be normalized away", () => {
    const json = JSON.stringify({ entryKind: "problem_sheet", question: "문제", figures: [{ id: "f", source: "described_only", representations: { cleaned: { image: "Missing.png" } } }] });
    expect(() => validateImportAssetReferences(json, [])).toThrow("Missing.png");
  });
  it("checks exact reference case, missing assets and drive paths", () => {
    const json = JSON.stringify({ entryKind: "problem_sheet", question: "1. 문제", questionImages: ["images/Graph.png"] });
    expect(() => validateImportAssetReferences(json, ["images/Graph.png"])).not.toThrow();
    expect(() => validateImportAssetReferences(json, ["images/graph.png"])).toThrow("일치");
    expect(() => validateImportAssetReferences(json, [])).toThrow("일치");
    for (const path of ["../a.png", "/a.png", "C:/a.png", "C:a.png", "a/../b.png", "a\\b.png"]) expect(safeImportAssetPath(path)).toBe(false);
  });
  it("rejects original traversal names sanitized by JSZip", async () => {
    const zip = new JSZip(); zip.file("import.json", JSON.stringify({entryKind:"problem_sheet",question:"문제"})); zip.file("../escape.png", validPngBytes);
    await expect(readZipImport(new File([await zip.generateAsync({type:"blob"})],"unsafe.zip"))).rejects.toThrow("안전하지");
  });
  it("rejects missing figure IDs even without image assets", () => {
    const json = JSON.stringify({ entryKind: "problem_sheet", questions: [{questionNumber:"1",questionText:"문제",contentSegments:[{id:"fig",type:"figure",figureId:"absent"}]}] });
    expect(() => validateImportAssetReferences(json, [])).toThrow("figureId");
  });
  it("rejects duplicate normalized image basenames before extraction", async () => {
    const zip = new JSZip();
    zip.file("import.json", "{}");
    zip.file("round1/Graph.png", validPngBytes);
    zip.file("round2/graph.png", validPngBytes);
    const blob = await zip.generateAsync({ type: "blob" });
    await expect(readZipImport(new File([blob], "bundle.zip", { type: "application/zip" })))
      .rejects.toThrow("중복된 이미지 파일명이 있습니다");
  });

  it("keeps all synthetic K7 source paths while extracting the 22 identity PNG assets", async () => {
    const zip = new JSZip();
    zip.file("import.json", JSON.stringify(createKangdaeK7SyntheticImport()));
    for (const figure of createKangdaeK7SyntheticImport().entries[0].figures) {
      zip.file(figure.representations.original.image, validPngBytes);
      zip.file(figure.representations.cleaned.image, validPngBytes);
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const result = await readZipImport(new File([blob], "synthetic-k7.zip", { type: "application/zip" }));

    expect(result.imageAssets).toHaveLength(22);
    expect(result.imageAssets.map((asset) => asset.sourcePath)).toContain("images/q29-cleaned-11.png");
    expect(result.imageFiles).toHaveLength(22);
  });

  it("keeps all 30 questions through ZIP extraction, import parsing, reload, and exam creation", async () => {
    const zip = new JSZip();
    zip.file("import.json", JSON.stringify(createKangdaeK7SyntheticImport()));
    for (const figure of createKangdaeK7SyntheticImport().entries[0].figures) {
      zip.file(figure.representations.original.image, validPngBytes);
      zip.file(figure.representations.cleaned.image, validPngBytes);
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const extracted = await readZipImport(new File([blob], "synthetic-k7.zip", { type: "application/zip" }));
    const imported = parseAllInOneImport(extracted.jsonText, extracted.jsonName);
    const reloaded = normalizeEntry({
      ...imported.entries[0],
      id: "synthetic-k7-zip-boundary",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as WrongAnswerEntry);

    expect(getEntryQuestions(reloaded).map((question) => question.questionNumber))
      .toEqual(Array.from({ length: 30 }, (_, index) => String(index + 1)));
    expect(createExamSession(reloaded).questions).toHaveLength(30);
  });
});
