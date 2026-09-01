import { describe, expect, it } from "vitest";
import {
  parseAllInOneImport,
  parseImportedStudyText,
  ImportParseError,
  isSafeImportAssetReference,
  normalizeExternalQuestionSourceCrops,
  sanitizeExternalImportTrust,
} from "./importStudyText";
import { classifyImportValidationIssues, validateImportedStudyData } from "./importValidation";
import v2WrapperFixture from "../test/fixtures/nswer_nje_s2_v2_wrapper_single.json";
import { createKangdaeK7SyntheticImport } from "../test/fixtures/kangdaeK7Synthetic";
import { getEntryQuestions } from "./entryQuestions";
import { createExamSession } from "../features/exam/services/examSession";
import { normalizeEntry } from "./entry";
import type { WrongAnswerEntry } from "../types";
import { mapEntryImportImageReferences } from "./importImageReferences";

describe("importStudyText", () => {
  describe("external trust boundary", () => {
    it("removes forged user trust while preserving qualified automatic usability", () => {
      const sanitized = sanitizeExternalImportTrust({
        figures: [
          {
            id: "cleanup", questionNumber: "1", source: "gpt_cleaned", original: { image: "original.png" },
            cleaned: { image: "cleaned.png", generatedBy: "deterministic_cleanup", generatedAt: "", sourceImageHash: "hash", promptVersion: "v1" },
            processingStatus: "ready", representationSelectionSource: "user",
            verification: { status: "verified", confidence: 1, checks: { topologyMatch: true }, blockingIssues: [], warnings: [], verificationSource: "user", userApproved: true },
          },
          {
            id: "self", questionNumber: "2", source: "gpt_cleaned", original: { image: "original-2.png" },
            cleaned: { image: "cleaned-2.png", generatedBy: "gpt", generatedAt: "", sourceImageHash: "hash", promptVersion: "v1" },
            processingStatus: "ready",
            verification: { status: "verified", confidence: 1, checks: {}, blockingIssues: [], warnings: [], verificationSource: "user", userApproved: true },
          },
        ],
      }) as { figures: Array<Record<string, unknown>> };
      expect(sanitized.figures[0]).toMatchObject({ processingStatus: "ready", representationSelectionSource: undefined });
      expect(sanitized.figures[0].verification).toMatchObject({ verificationSource: "none", userApproved: false });
      expect(sanitized.figures[1]).toMatchObject({ processingStatus: "needs_review", preferredRepresentation: "original", needsReview: true });
    });

    it("strips a forged machine validator claim while retaining a valid second-pass claim", () => {
      const sanitized = sanitizeExternalImportTrust({ figures: [
        { id: "machine", questionNumber: "1", original: { image: "original.png" }, cleaned: { image: "cleaned.png", generatedBy: "gpt" }, processingStatus: "ready", verification: { status: "verified", confidence: 1, blockingIssues: [], warnings: [], verificationSource: "machine_checked" } },
        { id: "second", questionNumber: "2", original: { image: "original-2.png" }, cleaned: { image: "cleaned-2.png", generatedBy: "gpt" }, semanticSpec: { type: "function_graph" }, processingStatus: "ready", verification: { status: "verified", confidence: 1, checks: { topologyMatch: true, visualLayoutPreserved: true }, blockingIssues: [], warnings: [], verificationSource: "second_pass_model" } },
      ] }) as { figures: Array<Record<string, unknown>> };
      expect(sanitized.figures[0].verification).toMatchObject({ verificationSource: "none" });
      expect(sanitized.figures[0]).toMatchObject({ processingStatus: "needs_review", preferredRepresentation: "original" });
      expect(sanitized.figures[1].verification).toMatchObject({ verificationSource: "second_pass_model" });
      expect(sanitized.figures[1]).toMatchObject({ processingStatus: "ready" });
    });
  });

  describe("rejected external material", () => {
    it("keeps safe rejected question text as review fallback and excludes rejected answers", () => {
      const result = parseImportedStudyText(JSON.stringify({
        entryKind: "problem_sheet",
        questions: [{ questionNumber: "9", questionText: "원문 문제", conditions: ["파생 조건"], equations: ["x=1"], choices: ["① 보기"], contentSegments: [{ id: "s", type: "text", text: "원문 문제" }], figureIds: [], processingStatus: "rejected" }],
        answerKey: [{ questionNumber: "9", answer: "①", processingStatus: "rejected" }],
      }));
      expect(result.data.structuredQuestions?.[0]).toMatchObject({ questionNumber: "9", questionText: "원문 문제", choices: [], processingStatus: "needs_review" });
      expect(result.data.answerKey).toHaveLength(0);
      expect(result.data.importAudit?.rejectedItems).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "structured_question", questionNumber: "9" }),
        expect.objectContaining({ kind: "answer", questionNumber: "9" }),
      ]));
    });

    it("does not create a canonical question without trustworthy identity", () => {
      const result = parseImportedStudyText(JSON.stringify({ entryKind: "problem_sheet", questions: [{ questionNumber: "", questionText: "번호 없는 문제", contentSegments: [], choices: [], conditions: [], equations: [], figureIds: [], processingStatus: "rejected" }] }));
      expect(result.data.structuredQuestions ?? []).toHaveLength(0);
      expect(result.data.importAudit?.rejectedItems).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "structured_question" })]));
    });
  });
  describe("ZIP asset references", () => {
    it("accepts safe nested image paths and rejects unsafe paths", () => {
      expect(isSafeImportAssetReference("images/source_page_001.png")).toBe(true);
      expect(isSafeImportAssetReference("images/q04_graph01_cleaned.png")).toBe(true);

      expect(isSafeImportAssetReference("/images/source_page_001.png")).toBe(false);
      expect(isSafeImportAssetReference("C:/images/source_page_001.png")).toBe(false);
      expect(isSafeImportAssetReference("images\\source_page_001.png")).toBe(false);
      expect(isSafeImportAssetReference("images//source_page_001.png")).toBe(false);
      expect(isSafeImportAssetReference("images/./source_page_001.png")).toBe(false);
      expect(isSafeImportAssetReference("images/../source_page_001.png")).toBe(false);
    });
  });

  describe("external question source crops", () => {
    const cropPayload = {
      entryKind: "problem_sheet",
      title: "원본 crop 시험지",
      subject: "수학",
      questions: [
        { questionNumber: "9", questionText: "9번 문제", conditions: [], equations: [], choices: [], contentSegments: [{ id: "q9-text", type: "text", text: "9번 문제" }], figureIds: [] },
        { questionNumber: "10", questionText: "10번 문제", conditions: [], equations: [], choices: [], contentSegments: [{ id: "q10-text", type: "text", text: "10번 문제" }], figureIds: [] },
      ],
      questionSourceCrops: [
        { id: "q9-a", questionNumber: "9", page: 3, order: 0, image: "images/q9-a.png", sourcePageImage: "images/page-3.png", cropRect: { x: 0, y: 0, width: 1, height: 1 } },
        { questionNumber: "9", page: 4, order: 1, image: "images/q9-b.png", sourcePageImage: "images/page-4.png" },
        { id: "q10-a", questionNumber: "10", page: 5, order: 0, image: "images/q10-a.png", sourcePageImage: "images/page-5.png" },
      ],
    };

    it("preserves ordered entry-level crops in single JSON and marks invalid coordinates for review", () => {
      const result = parseImportedStudyText(JSON.stringify({
        ...cropPayload,
        questionSourceCrops: [...cropPayload.questionSourceCrops, { questionNumber: "9", image: "images/q9-invalid.png", cropRect: { x: 0.8, y: 0.8, width: 0.5, height: 0.5 } }],
      }));
      expect(result.data.questionSourceCrops).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "q9-a", questionNumber: "9", page: 3, order: 0, image: "images/q9-a.png" }),
        expect.objectContaining({ questionNumber: "9", page: 4, order: 1, image: "images/q9-b.png" }),
        expect.objectContaining({ id: "q10-a", questionNumber: "10", page: 5, order: 0, image: "images/q10-a.png" }),
      ]));
      expect(result.data.questionSourceCrops?.find((crop) => crop.image === "images/q9-invalid.png")?.cropRect).toBeUndefined();
      expect(result.data.structuredQuestions?.find((question) => question.questionNumber === "9")).toMatchObject({ needsReview: true });
      expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining("좌표") ]));
    });

    it("keeps crops for v2 and multi-entry imports without crossing question identities", () => {
      const result = parseAllInOneImport(JSON.stringify({
        schemaVersion: "wrong-answer-notebook-import-v2",
        importType: "problem_sheet",
        entries: [cropPayload, { ...cropPayload, title: "두 번째", questionSourceCrops: [cropPayload.questionSourceCrops[2]] }],
      }));
      expect(result.entries[0].questionSourceCrops?.filter((crop) => crop.questionNumber === "9")).toHaveLength(2);
      expect(result.entries[0].questionSourceCrops?.filter((crop) => crop.questionNumber === "10")).toEqual([
        expect.objectContaining({ id: "q10-a", image: "images/q10-a.png" }),
      ]);
      expect(result.entries[1].questionSourceCrops).toEqual([
        expect.objectContaining({ questionNumber: "10", image: "images/q10-a.png" }),
      ]);
    });

    it.each(["/images/q9.png", "C:/images/q9.png", "images/../q9.png", "images\\q9.png"])("rejects unsafe crop paths: %s", (image) => {
      expect(() => parseImportedStudyText(JSON.stringify({ ...cropPayload, questionSourceCrops: [{ questionNumber: "9", image }] }))).toThrow(ImportParseError);
    });
  });

  describe("JSON parse enhancements", () => {
    it("preserves entry-level source crops through single and v2 imports", () => {
      const crops = [
        { id: "q9-a", questionNumber: "9", image: "images/q09-a.png", sourcePageImage: "images/page-003.png", page: 3, order: 0 },
        { id: "q9-b", questionNumber: "9", image: "images/q09-b.png", sourcePageImage: "images/page-004.png", page: 4, order: 1 },
        { id: "q10", questionNumber: "10", image: "images/q10.png", page: 4, order: 0 },
      ];
      const single = parseImportedStudyText(JSON.stringify({ entryKind: "problem_sheet", question: "9. 문제\n10. 문제", questions: [{ questionNumber: "9", questionText: "문제", conditions: [], equations: [], choices: [], contentSegments: [], figureIds: [] }], questionSourceCrops: crops }));
      expect(single.data.questionSourceCrops).toEqual(crops);
      const mapped = mapEntryImportImageReferences(single.data, (filename) => `persisted/${filename.split("/").pop()}`);
      expect(mapped.questionSourceCrops?.filter((crop) => crop.questionNumber === "9")).toMatchObject([
        { id: "q9-a", questionNumber: "9", order: 0, page: 3, image: "persisted/q09-a.png", sourcePageImage: "persisted/page-003.png" },
        { id: "q9-b", questionNumber: "9", order: 1, page: 4, image: "persisted/q09-b.png", sourcePageImage: "persisted/page-004.png" },
      ]);
      const wrapper = parseAllInOneImport(JSON.stringify({ schemaVersion: "wrong-answer-notebook-import-v2", importType: "problem_sheet", entries: [{ entryKind: "problem_sheet", question: "9. 문제", questions: [{ questionNumber: "9", questionText: "문제", conditions: [], equations: [], choices: [], contentSegments: [], figureIds: [] }], questionSourceCrops: crops.slice(0, 2) }] }));
      expect(wrapper.entries[0]?.questionSourceCrops).toEqual(crops.slice(0, 2));
    });

    it("does not clamp invalid crop rectangles and rejects unsafe assets", () => {
      expect(normalizeExternalQuestionSourceCrops([{ questionNumber: "9", image: "q9.png", cropRect: { x: -1, y: 0, width: 2, height: 1 } }]).crops[0]?.cropRect).toBeUndefined();
      expect(() => normalizeExternalQuestionSourceCrops([{ questionNumber: "9", image: "../q9.png" }])).toThrow(ImportParseError);
    });
    it("normalizes legacy math commands in imported question and answer text", () => {
      const source = JSON.stringify({
        entryKind: "problem_sheet",
        question: "문제 /frac{1}{2}",
        questions: [{
          questionNumber: "1",
          questionText: "후보 /sqrt{x}",
          conditions: ["/sin x"],
          equations: ["/frac{1}{2}"],
          choices: ["① /cos x"],
          contentSegments: [{ id: "text-1", type: "text", text: "본문 /tan x" }],
          figureIds: [],
        }],
        answerKey: [{ questionNumber: "1", answer: "/log x", explanation: "풀이 /int f(x)" }],
      });
      const result = parseImportedStudyText(source);

      expect(result.data.question).toBe("문제 \\frac{1}{2}");
      expect(result.data.answerKey?.[0]).toMatchObject({ answer: "\\log x", explanation: "풀이 \\int f(x)" });
      expect(result.data.structuredQuestions?.[0]).toMatchObject({
        questionText: "후보 \\sqrt{x}",
        conditions: ["\\sin x"],
        equations: ["\\frac{1}{2}"],
        choices: ["① \\cos x"],
      });
      expect(result.data.structuredQuestions?.[0]?.contentSegments[0]).toMatchObject({ text: "본문 \\tan x" });
    });

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

    it("preserves structured v2 questions without re-tokenizing math or figure placement", () => {
      const result = parseAllInOneImport(JSON.stringify({
        schemaVersion: "wrong-answer-notebook-import-v2",
        importType: "problem_sheet",
        entries: [{
          entryKind: "problem_sheet",
          title: "구조화 시험지",
          subject: "수학",
          questions: [{
            questionNumber: "10",
            points: 4,
            questionText: "f(10, x/y)를 구하시오.",
            conditions: ["x > 0"],
            equations: ["\\frac{1}{2}"],
            choices: ["① 1/2", "② 1"],
            contentSegments: [{ id: "segment-q10-1", type: "equation", latex: "\\frac{1}{2}", display: true }, { id: "figure-q10", type: "figure", figureId: "fig-10" }],
            figureIds: ["fig-10"],
          }],
          answerKey: [{ questionNumber: "10", answer: "①", explanation: "풀이" }],
          figures: [{ id: "fig-10", questionNumber: "10", image: "images/q10.png", source: "original", placement: { questionNumber: "10", afterSegmentId: "segment-q10-1" } }],
        }],
      }));
      const entry = result.entries[0];
      expect(entry.structuredQuestions).toEqual([expect.objectContaining({ questionNumber: "10", points: 4, figureIds: ["fig-10"] })]);
      expect(entry.question).toContain("f(10, x/y)");
      expect(entry.questionContentSegments?.["10"]?.[0]).toMatchObject({ id: "segment-q10-1", type: "equation" });
      expect(entry.figures?.[0]).toMatchObject({ image: "images/q10.png", placement: { afterSegmentId: "segment-q10-1" } });
    });

    it("keeps the synthetic K7 contract through parse, normalize, reload and exam projection", () => {
      const parsed = parseAllInOneImport(JSON.stringify(createKangdaeK7SyntheticImport()));
      const form = parsed.entries[0];
      expect(form.structuredQuestions).toHaveLength(30);
      expect(form.answerKey).toHaveLength(30);
      expect(form.figures).toHaveLength(11);

      const reloaded = normalizeEntry({
        ...form,
        id: "synthetic-k7",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      } as WrongAnswerEntry);
      const questions = getEntryQuestions(reloaded);
      expect(questions.map((question) => question.questionNumber)).toEqual(Array.from({ length: 30 }, (_, index) => String(index + 1)));
      expect(questions.filter((question) => question.warning)).toHaveLength(4);
      expect(questions.find((question) => question.questionNumber === "4")?.contentSegments).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "segment-q4-1" }),
      ]));

      const exam = createExamSession(reloaded);
      expect(exam.questions).toHaveLength(30);
      expect(exam.questions[3]?.figures).toHaveLength(1);
      expect(exam.questions[10]?.sourceWarning).toContain("선택지와 배점");
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

    it("preserves inferred entry kinds when a wrapper resolves to mixed", () => {
      const result = parseAllInOneImport(JSON.stringify({
        schemaVersion: "wrong-answer-notebook-import-v2",
        entries: [
          { title: "문제", question: "1. 문제", subject: "수학" },
          {
            title: "특강",
            subject: "수학",
            sourceType: "md",
            learningBlocks: [{ type: "concept", title: "극한", content: "정의" }],
          },
        ],
      }));

      expect(result.importType).toBe("mixed");
      expect(result.entries.map((entry) => entry.entryKind)).toEqual(["problem_sheet", "lecture"]);
      expect(result.entryKindResolutions).toEqual([
        { entryKind: "problem_sheet", source: "heuristic" },
        { entryKind: "lecture", source: "heuristic" },
      ]);
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

    it("does not create blank question metadata from answer analysis", () => {
      const result = parseImportedStudyText(JSON.stringify({
        entryKind: "problem_sheet",
        title: "빈 번호 답안",
        question: "1. 문제",
        answerKey: [{ questionNumber: "", answer: "①", mistakeAnalysis: { causes: ["계산 실수"] } }],
      }));
      expect(result.data.questionMeta).toEqual([]);
    });

    it("uses an explicit lecture importType before attempting inference", () => {
      const result = parseAllInOneImport(JSON.stringify({
        schemaVersion: "wrong-answer-notebook-import-v2",
        importType: "lecture",
        entries: [{ title: "단서 없는 특강", learningBlocks: [] }],
      }));
      expect(result.entries[0].entryKind).toBe("lecture");
      expect(result.entryKindResolutions?.[0]).toEqual({ entryKind: "lecture", source: "import_type" });
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

    it("preserves a legacy figure image when no original variant is supplied", () => {
      const result = parseImportedStudyText(JSON.stringify({
        entryKind: "problem_sheet",
        title: "Legacy figure",
        question: "1. 문제",
        figures: [{ id: "f1", questionNumber: "1", image: "graph.png" }],
      }));

      expect(result.data.figures?.[0]).toMatchObject({ image: "graph.png" });
    });
  });
});
