import { afterEach, describe, expect, it } from "vitest";
import type { GeneratedExam, WrongAnswerEntry } from "../../types";
import { activeContextMessages, AI_STUDY_STORAGE_KEY, buildAiContext, changeAiScope, DEFAULT_AI_SHARING, entryAiMaterials, isAiStudyStore, projectAiMaterial, type AiConversation, type AiMaterial } from "./model";
import { limitExamMaterials, proposalFromSelection, validateExamSelection, type AiExamConfig } from "./examProposal";
import { getBrowserProtectedImageReferences } from "../../services/api/browserImageReferences";
import { createSessionFromGeneratedExam } from "../exam-builder/services/createSessionFromGeneratedExam";
import { generatedExamToQuestionExport } from "../export/services/questionExport";
const material = (id: string, group?: string): AiMaterial => ({ id, source: { sourceEntryId: id, sourceEntryTitle: `원본 ${id}`, sourceQuestionNumber: "1" }, units: ["미분"], difficulty: 60, importance: 80, memo: "PRIVATE_MEMO", learning: { lapseCount: 7 }, snapshot: { id, questionNumber: "1", question: "BODY_SECRET", choices: ["CHOICE_SECRET"], passage: "PASSAGE_SECRET", contentSegments: [{ id: "a", type: "text", text: "BODY_SECRET" }, { id: "b", type: "equation", latex: "x+x", display: true }, { id: "c", type: "equation", latex: "x+x", display: true }], questionImages: ["private.png"], figures: [], correctAnswer: "ANSWER_SECRET", explanation: "EXPLANATION_SECRET", stimulusGroupId: group } });
const config: AiExamConfig = { title: "구성", subject: "수학", count: 2, minutes: 30, points: 10, maxPerSource: 2, easy: 0, medium: 0, hard: 0, unitCounts: {}, prioritizeImportance: true, instruction: "" };
const materials = [material("a", "g"), material("b", "g"), material("c")];
materials[1].source.sourceEntryId = "a";
materials[1].source.sourceQuestionNumber = "2";
const selection = [{ id: "a", points: 5, reason: "이유" }, { id: "b", points: 5, reason: "이유" }];
const conversation = (): AiConversation => ({ id: "c", title: "대화", updatedAt: new Date().toISOString(), contextId: "old", materials: [material("a")], sharing: { ...DEFAULT_AI_SHARING, answers: true }, messages: [{ id: "m", role: "assistant", text: "OLD_ANSWER", contextId: "old", status: "complete" }] });
afterEach(() => localStorage.clear());
describe("study AI boundaries", () => {
    it("whitelists each independent sharing field and preserves repeated canonical equations", () => {
        const q = material("a");
        const projected = JSON.stringify(projectAiMaterial(q, DEFAULT_AI_SHARING));
        expect(projected).toContain("BODY_SECRET");
        expect(projected.match(/x\+x/g)).toHaveLength(2);
        for (const secret of ["ANSWER_SECRET", "EXPLANATION_SECRET", "PRIVATE_MEMO", "private.png", "lapseCount"])
            expect(projected).not.toContain(secret);
        for (const [field, secrets] of [["body", ["BODY_SECRET", "PASSAGE_SECRET"]], ["choices", ["CHOICE_SECRET"]], ["images", ["private.png"]], ["answers", ["ANSWER_SECRET"]], ["explanations", ["EXPLANATION_SECRET"]], ["memo", ["PRIVATE_MEMO"]], ["learning", ["lapseCount"]]] as const) {
            const all = { body: true, choices: true, images: true, answers: true, explanations: true, memo: true, learning: true };
            const text = JSON.stringify(projectAiMaterial(q, { ...all, [field]: false }));
            for (const secret of secrets)
                expect(text).not.toContain(secret);
        }
        expect(JSON.stringify(projectAiMaterial(q, { ...DEFAULT_AI_SHARING, answers: true, explanations: true }))).toContain("ANSWER_SECRET");
    });
    it("never replays prior granted answers after a scope change", () => {
        const old = conversation();
        const next = changeAiScope(old, old.materials, DEFAULT_AI_SHARING);
        expect(next.messages[0].text).toBe("OLD_ANSWER");
        expect(activeContextMessages(next)).toEqual([]);
        expect(next.contextId).not.toBe(old.contextId);
        expect(old.sharing.answers).toBe(true);
        expect(next.sharing.answers).toBe(false);
    });
    it("rejects excess images before sending", () => {
        expect(() => buildAiContext(Array.from({ length: 21 }, (_, i) => ({ ...material(String(i)), snapshot: { ...material(String(i)).snapshot, questionImages: [`${i}.png`] } })), { ...DEFAULT_AI_SHARING, images: true })).toThrow("20");
    });
    it("protects deleted-source images referenced only by a saved conversation and fails closed", () => {
        localStorage.setItem(AI_STUDY_STORAGE_KEY, JSON.stringify({ version: 1, conversations: [conversation()] }));
        expect(getBrowserProtectedImageReferences([]).has("private.png")).toBe(true);
        localStorage.setItem(AI_STUDY_STORAGE_KEY, JSON.stringify({ version: 1, conversations: [{ ...conversation(), materials: "broken" }] }));
        expect(() => getBrowserProtectedImageReferences([])).toThrow();
        expect(isAiStudyStore({ version: 1, conversations: [] })).toBe(true);
    });
    it("omits ambiguous source question numbers from AI candidates", () => {
        const e = { id: "s", title: "원본", entryKind: "problem_sheet", subject: "수학", question: "1. 첫 문제\n1. 다른 문제", tags: [], questionImages: [], answerKey: [], questionMeta: [], memo: "" } as unknown as WrongAnswerEntry;
        const ids = entryAiMaterials(e).map(m => m.id);
        expect(ids).toHaveLength(0);
    });
});
describe("AI proposal validation and immutable materialization", () => {
    it("distinguishes two original number-one questions from different source sheets",()=>{
      const a=material("sheet-a"),b=material("sheet-b");const exam=proposalFromSelection(JSON.stringify({summary:"두 출처",questions:[{id:a.id,points:5,reason:"A"},{id:b.id,points:5,reason:"B"}]}),[a,b],config);const session=createSessionFromGeneratedExam(exam);
      expect(session.questions.map(q=>q.questionNumber)).toEqual(["1","2"]);expect(session.questions.map(q=>q.sourceReference?.sourceQuestionNumber)).toEqual(["1","1"]);expect(session.questions.map(q=>q.sourceReference?.sourceEntryTitle)).toEqual(["원본 sheet-a","원본 sheet-b"]);
    });

    it("keeps stimulus groups intact at the request limit", () => { expect(limitExamMaterials(materials, 1).map(m => m.id)).toEqual(["c"]); });
    it("uses local snapshots and retains source after rename/deletion and serialization", () => {
        const text = JSON.stringify({ summary: "구성 요약", questions: selection });
        const exam = proposalFromSelection(text, materials, config);
        materials[0].source.sourceEntryTitle = "바뀐 이름";
        const session = createSessionFromGeneratedExam(JSON.parse(JSON.stringify(exam)) as GeneratedExam);
        expect(session.questions[0].sourceReference?.sourceEntryTitle).toBe("원본 a");
        expect(session.questions.map(q => q.questionNumber)).toEqual(["1", "2"]);
        expect(session.questions[1].sourceReference?.sourceQuestionNumber).toBe("2");
        expect(session.questions[0].correctAnswer).toBe("ANSWER_SECRET");
        expect(session.questions[0].points).toBe(5);
        const exportData = generatedExamToQuestionExport({ ...exam, showSourceReferences: false });
        expect(exportData.questions[0].source).toBeUndefined();
        materials[0].source.sourceEntryTitle = "원본 a";
    });
    it.each([
        [[{ ...selection[0], id: "missing" }, selection[1]], "허용"],
        [[selection[0], selection[0]], "중복"],
        [[{ ...selection[0], points: 4 }, selection[1]], "배점"],
        [[selection[0], { ...selection[1], id: "c" }], "공통"],
    ])("rejects unsafe selection %#", (items, message) => { expect(() => validateExamSelection(items as typeof selection, materials, config)).toThrow(message as string); });
    it("rejects a moved lock, unmet source limit, difficulty and unit targets", () => {
        const exam = proposalFromSelection(JSON.stringify({ summary: "s", questions: selection }), materials, config);
        expect(() => validateExamSelection([...selection].reverse(), materials.map(m=>({...m,snapshot:{...m.snapshot,stimulusGroupId:undefined}})), config, [{ ...exam.questions[0], locked: true }])).toThrow("고정");
        const sameSource = materials.map(m => ({ ...m, source: { ...m.source, sourceEntryId: "same" } }));
        expect(() => validateExamSelection(selection, sameSource, { ...config, maxPerSource: 1 })).toThrow("출처");
        expect(() => validateExamSelection(selection, materials, { ...config, easy: 2 })).toThrow("난이도");
        expect(() => validateExamSelection(selection, materials, { ...config, unitCounts: { "다른 단원": 2 } })).toThrow("단원");
    });
});
