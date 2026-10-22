import { validPngBytes } from "../../../test/fixtures/validPng";
import { afterEach, expect, it } from "vitest";
import { parseAllInOneImport } from "../../../utils/importStudyText";
import { mapEntryImportImageReferences, collectEntryImportImageReferences } from "../../../utils/importImageReferences";
import { normalizeEntry } from "../../../utils/entry";
import { applyBrowserBackupAtomically } from "../../../services/api/backup";
import { getBrowserProtectedImageReferences } from "../../../services/api/browserImageReferences";
import { DEFAULT_SETTINGS } from "../../../services/api/settings";
import { selectFigureRepresentation } from "./selectFigureRepresentation";
import { resolveFigureRepresentation } from "./figureRepresentation";
import type { WrongAnswerEntry } from "../../../types";

afterEach(() => localStorage.clear());

it("preserves both assets and an in-app choice through mapping, backup restore and reload", async () => {
  const imported = parseAllInOneImport(JSON.stringify({ entryKind: "problem_sheet", title: "diagram", subject: "수학", question: "1. [FIGURE:f]", figures: [{ id: "f", questionNumber: "1", title: "graph", caption: "", source: "original", original: { image: "original.png", sourcePageImage: "page.png", crop: { x: 0, y: 0, width: 1, height: 1 } }, cleaned: { image: "candidate.png", generatedBy: "computational_redraw", generatedAt: "", sourceImageHash: "", promptVersion: "v7" } }], sourcePageImages: ["page.png"] }), "import.json").entries[0];
  const figure = imported.figures![0];
  imported.figures = [{ ...figure, ...selectFigureRepresentation(figure, "cleaned", true) }];
  const mapped = mapEntryImportImageReferences(imported, name => `saved-${name}`);
  const entry = normalizeEntry({ ...mapped, id: "figure-backup", createdAt: "2026-10-22T00:00:00.000Z", updatedAt: "2026-10-22T00:00:00.000Z" } as WrongAnswerEntry);
  const references = new Set(collectEntryImportImageReferences(entry));
  expect([...references].sort()).toEqual(["saved-candidate.png", "saved-original.png", "saved-page.png"]);
  const protectedImages = getBrowserProtectedImageReferences([entry], { includeStoredEntries: false });
  references.forEach(name => expect(protectedImages.has(name)).toBe(true));
  const browserImages = Object.fromEntries([...references].map(name => [`img_${name}`, `data:image/png;base64,${btoa(String.fromCharCode(...validPngBytes))}`]));
  await applyBrowserBackupAtomically({ meta: { version: 1, createdAt: "2026-10-22T00:00:00.000Z", source: "browser" }, entries: [entry], settings: DEFAULT_SETTINGS, browserImages });
  const reloaded = normalizeEntry(JSON.parse(localStorage.getItem("wrong-answer-entries")!).entries[0]);
  expect(resolveFigureRepresentation(reloaded.figures![0]).image).toBe("saved-candidate.png");
  expect(resolveFigureRepresentation(reloaded.figures![0], { forPrint: true }).image).toBe("saved-candidate.png");
  expect(reloaded.figures![0].original?.image).toBe("saved-original.png");
});
