import { describe, expect, it } from "vitest";
import { parseAllInOneImport, parseImportedStudyText, ImportParseError } from "./importStudyText";
import { classifyImportValidationIssues, validateImportedStudyData } from "./importValidation";
import v2WrapperFixture from "../test/fixtures/nswer_nje_s2_v2_wrapper_single.json";

describe("importStudyText", () => {
  describe("JSON parse enhancements", () => {
    it("removes UTF-8 BOM", () => {
      const jsonWithBom = '\uFEFF{"entryKind": "problem_sheet", "question": "test", "subject": "수학"}';
      const result = parseImportedStudyText(jsonWithBom);
      expect(result.detectedFormat).toBe("json");
      expect(result.data.question).toBe("test");
    });

    it("unwraps code fence", () => {
      const fenced = '```json\n{"entryKind": "problem_sheet", "question": "test", "subject": "수학"}\n```';
      const result = parseImportedStudyText(fenced);
      expect(result.detectedFormat).toBe("json");
      expect(result.data.question).toBe("test");
    });

    it("extracts JSON from surrounding text", () => {
      const withText = 'Here is the result:\n{"entryKind": "problem_sheet", "question": "test", "subject": "수학"}\nDone.';
      const result = parseImportedStudyText(withText);
      expect(result.detectedFormat).toBe("json");
      expect(result.data.question).toBe("test");
    });

    it("trims whitespace", () => {
      const withWhitespace = '  \n\n  {"entryKind": "problem_sheet", "question": "test", "subject": "수학"}  \n  ';
      const result = parseImportedStudyText(withWhitespace);
      expect(result.detectedFormat).toBe("json");
      expect(result.data.question).toBe("test");
    });
  });

  describe("v2 wrapper support", () => {
    it("parses v2 wrapper with single entry", () => {
      const result = parseImportedStudyText(JSON.stringify(v2WrapperFixture), "test.json", "수학");
      expect(result.detectedFormat).toBe("json");
      expect(result.data.entryKind).toBe("problem_sheet");
      expect(result.data.title).toBe("Nswer N제 수학 II 1단원 함수의 극한과 연속");
      expect(result.data.answerKey).toBeDefined();
      expect(result.data.answerKey?.length).toBe(18);
      expect(result.data.figures).toBeDefined();
      expect(result.data.figures?.length).toBe(6);
      expect(result.data.learningBlocks).toBeDefined();
      expect(result.data.learningBlocks?.length).toBeGreaterThan(0);
      expect(result.data.questionMeta).toEqual(expect.arrayContaining([
        expect.objectContaining({ questionNumber: "7", important: true, difficultyScore: 72 }),
      ]));
    });

    it("handles described_only figures without blocking", () => {
      const result = parseImportedStudyText(JSON.stringify(v2WrapperFixture), "test.json", "수학");
      const figures = result.data.figures ?? [];
      const describedOnly = figures.filter((fig) => fig.source === "described_only");
      expect(describedOnly.length).toBeGreaterThan(0);
      describedOnly.forEach((fig) => {
        expect(fig.image).toBeUndefined();
        expect(fig.caption).toBeTruthy();
      });
      const policy = classifyImportValidationIssues(validateImportedStudyData(result.data));
      expect(policy.blocking).toEqual([]);
      expect(policy.confirmable.filter((issue) => issue.id.startsWith("unlinked-figure-"))).toEqual([]);
    });

    it("parses multiple entries in v2 wrapper for batch preview", () => {
      const multiEntry = {
        schemaVersion: "wrong-answer-notebook-import-v2",
        importType: "problem_sheet",
        entries: [
          { entryKind: "problem_sheet", question: "Q1", subject: "수학" },
          { entryKind: "problem_sheet", question: "Q2", subject: "수학" },
        ],
      };
      const result = parseAllInOneImport(JSON.stringify(multiEntry));
      expect(result.importType).toBe("problem_sheet");
      expect(result.entries).toHaveLength(2);
      expect(result.entries.every((entry) => entry.entryKind === "problem_sheet")).toBe(true);
    });

    it.each([
      ["concept_entries", [{ entryKind: "concept", title: "극한", question: "정의", subject: "수학" }]],
      ["lecture", [{ entryKind: "lecture", title: "극한 특강", subject: "수학", learningBlocks: [{ type: "concept", title: "극한", content: "정의" }] }]],
      ["mixed", [
        { entryKind: "concept", title: "극한", question: "정의", subject: "수학" },
        { entryKind: "problem_sheet", title: "문제", question: "1. 문제", subject: "수학" },
      ]],
    ])("parses %s v2 wrapper", (importType, entries) => {
      const result = parseAllInOneImport(JSON.stringify({
        schemaVersion: "wrong-answer-notebook-import-v2",
        importType,
        entries,
      }));
      expect(result.importType).toBe(importType);
      expect(result.entries).toHaveLength(entries.length);
    });

    it("throws clear error for empty entries array", () => {
      const emptyEntries = {
        schemaVersion: "wrong-answer-notebook-import-v2",
        importType: "problem_sheet",
        entries: [],
      };
      expect(() => parseImportedStudyText(JSON.stringify(emptyEntries))).toThrow(ImportParseError);
      expect(() => parseImportedStudyText(JSON.stringify(emptyEntries))).toThrow("가져올 entries 항목이 없습니다");
    });

    it("throws clear error when a v2 wrapper has no entries property", () => {
      const missingEntries = {
        schemaVersion: "wrong-answer-notebook-import-v2",
        importType: "problem_sheet",
      };
      expect(() => parseAllInOneImport(JSON.stringify(missingEntries))).toThrow(
        "JSON은 읽었지만 가져올 entries 항목이 없습니다.",
      );
    });

    it("throws clear error for non-array entries", () => {
      const badEntries = {
        schemaVersion: "wrong-answer-notebook-import-v2",
        importType: "problem_sheet",
        entries: "not an array",
      };
      expect(() => parseImportedStudyText(JSON.stringify(badEntries))).toThrow(ImportParseError);
      expect(() => parseImportedStudyText(JSON.stringify(badEntries))).toThrow("entries는 배열이어야 합니다");
    });

    it("infers a missing entryKind for a problem-sheet wrapper", () => {
      const noEntryKind = {
        schemaVersion: "wrong-answer-notebook-import-v2",
        importType: "problem_sheet",
        entries: [{ question: "Q1", subject: "수학" }],
      };
      const result = parseImportedStudyText(JSON.stringify(noEntryKind));
      expect(result.data.entryKind).toBe("problem_sheet");
      expect(result.entryKindResolution).toEqual({ entryKind: "problem_sheet", source: "import_type" });
    });

    it("reports the item index when mixed import cannot infer entryKind", () => {
      expect(() => parseAllInOneImport(JSON.stringify({
        schemaVersion: "wrong-answer-notebook-import-v2",
        importType: "mixed",
        entries: [{ question: "Q1", subject: "수학" }],
      }))).toThrow("entries[0]");
    });

    it("preserves lecture images, source pages, figures, and block image links", () => {
      const result = parseImportedStudyText(JSON.stringify({
        entryKind: "lecture",
        title: "함수 특강",
        subject: "수학",
        sourceType: "json",
        questionImages: ["page.png"],
        sourcePageImages: ["source.png"],
        figures: [{ id: "fig-1", questionNumber: "", title: "그래프", caption: "설명", image: "figure.png", source: "original" }],
        learningBlocks: [{ id: "block-1", type: "concept", title: "핵심", content: "내용", images: ["block.png"], figureIds: ["fig-1"] }],
      }));
      expect(result.data).toMatchObject({
        entryKind: "lecture",
        questionImages: ["page.png"],
        sourcePageImages: ["source.png"],
        figures: [expect.objectContaining({ id: "fig-1", image: "figure.png" })],
        learningBlocks: [expect.objectContaining({ images: ["block.png"], figureIds: ["fig-1"] })],
      });
    });

    it("rejects unsupported schema versions and import types", () => {
      expect(() => parseAllInOneImport(JSON.stringify({
        schemaVersion: "wrong-answer-notebook-import-v3",
        importType: "problem_sheet",
        entries: [],
      }))).toThrow("지원하지 않는 import schemaVersion입니다");
      expect(() => parseAllInOneImport(JSON.stringify({
        schemaVersion: "wrong-answer-notebook-import-v2",
        importType: "unknown",
        entries: [{ entryKind: "problem_sheet", question: "1. 문제" }],
      }))).toThrow("지원하지 않는 importType입니다");
    });

    it("reports actual JSON parse failures only in strict all-in-one parsing", () => {
      expect(() => parseAllInOneImport("설명만 있고 JSON은 없습니다")).toThrow(
        "JSON 형식으로 읽지 못했습니다. 코드블록이나 설명 문장이 섞였는지 확인하세요.",
      );
      expect(parseImportedStudyText("일반 텍스트 문제").detectedFormat).toBe("text");
    });
  });

  describe("backward compatibility", () => {
    it("still parses legacy single entry JSON", () => {
      const legacy = {
        entryKind: "problem_sheet",
        title: "Legacy test",
        subject: "수학",
        question: "01. Test question",
        answerKey: [{ questionNumber: "01", answer: "①", explanation: "test" }],
      };
      const result = parseImportedStudyText(JSON.stringify(legacy));
      expect(result.detectedFormat).toBe("json");
      expect(result.data.entryKind).toBe("problem_sheet");
      expect(result.data.title).toBe("Legacy test");
    });

    it("still parses concept entries", () => {
      const concept = {
        entryKind: "concept",
        title: "Test concept",
        subject: "수학",
        summary: "Concept summary",
      };
      const result = parseImportedStudyText(JSON.stringify(concept));
      expect(result.detectedFormat).toBe("json");
      expect(result.data.entryKind).toBe("concept");
      expect(result.data.title).toBe("Test concept");
    });

    it("does not trust user approval fields from external figure JSON", () => {
      const result = parseImportedStudyText(JSON.stringify({
        entryKind: "problem_sheet",
        title: "Figure import",
        question: "1. 문제",
        figures: [{ id: "f1", questionNumber: "1", image: "preferred.png", source: "gpt_cleaned", original: { image: "original.png" }, cleaned: { image: "cleaned.png", generatedBy: "gpt", generatedAt: "", sourceImageHash: "h", promptVersion: "v" }, preferredRepresentation: "cleaned", representationSelectionSource: "user", verification: { status: "verified", confidence: 1, blockingIssues: [], warnings: [], userApproved: true } }],
      }));
      const figure = result.data.figures?.[0];
      expect(figure?.representationSelectionSource).not.toBe("user");
      expect(figure?.verification?.userApproved).toBe(false);
      expect(figure?.verification?.verificationSource).toBe("gpt_self_check");
      expect(figure?.source).toBe("original");
      expect(figure?.image).toBe("original.png");
    });
  });
});
