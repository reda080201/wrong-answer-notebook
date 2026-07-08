import { describe, expect, it } from "vitest";
import { parseImportedStudyText, ImportParseError } from "./importStudyText";
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
    });

    it("throws clear error for multiple entries in v2 wrapper", () => {
      const multiEntry = {
        schemaVersion: "wrong-answer-notebook-import-v2",
        importType: "problem_sheet",
        entries: [
          { entryKind: "problem_sheet", question: "Q1", subject: "수학" },
          { entryKind: "problem_sheet", question: "Q2", subject: "수학" },
        ],
      };
      expect(() => parseImportedStudyText(JSON.stringify(multiEntry))).toThrow(ImportParseError);
      expect(() => parseImportedStudyText(JSON.stringify(multiEntry))).toThrow("다중 항목 가져오기는 아직 지원하지 않습니다");
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

    it("throws clear error for non-array entries", () => {
      const badEntries = {
        schemaVersion: "wrong-answer-notebook-import-v2",
        importType: "problem_sheet",
        entries: "not an array",
      };
      expect(() => parseImportedStudyText(JSON.stringify(badEntries))).toThrow(ImportParseError);
      expect(() => parseImportedStudyText(JSON.stringify(badEntries))).toThrow("entries는 배열이어야 합니다");
    });

    it("throws clear error for entry without entryKind", () => {
      const noEntryKind = {
        schemaVersion: "wrong-answer-notebook-import-v2",
        importType: "problem_sheet",
        entries: [{ question: "Q1", subject: "수학" }],
      };
      expect(() => parseImportedStudyText(JSON.stringify(noEntryKind))).toThrow(ImportParseError);
      expect(() => parseImportedStudyText(JSON.stringify(noEntryKind))).toThrow("entryKind가 없습니다");
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
  });
});
