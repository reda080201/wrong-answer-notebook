import { afterEach, expect, it, vi } from "vitest";
import type { ExamSession, GeneratedExam, McpExportContext, WrongAnswerEntry } from "../../../types";
import { syncMcpBridgeExportContext } from "../../../services/api/mcpBridge";
import { assertRealExamSourcesAllowed, getRealExamProtection, setActiveRealExamProtection, setSavedRealExamProtection, subscribeRealExamProtection } from "./realExamProtection";
const exam = (id: string, source: string): ExamSession => ({ id, entryId: `generated:${id}`, title: id, mode: "real", status: "in_progress", questions: [{ id: `${id}-q`, sourceEntryId: source, questionNumber: "1" }], deadlineAt: "2000-01-01T00:00:00Z" } as ExamSession);
afterEach(() => { setActiveRealExamProtection(null); setSavedRealExamProtection([]); });
it("keeps saved real-exam sources protected when the visible exam is closed and after startup", () => {
  const session = exam("first", "sheet-a");
  setSavedRealExamProtection([session]); setActiveRealExamProtection(session); setActiveRealExamProtection(null);
  expect(() => assertRealExamSourcesAllowed(["sheet-a"])).toThrow("시험을 닫아도");
  expect(() => assertRealExamSourcesAllowed(["other"])).not.toThrow();
});
it("does not release protection on expiry, and submission only releases that session", () => {
  const first = exam("first", "a"), second = exam("second", "b");
  setSavedRealExamProtection([first, second]);
  expect(getRealExamProtection().sourceIds.has("a")).toBe(true);
  setActiveRealExamProtection({ ...first, status: "submitted" });
  expect(() => assertRealExamSourcesAllowed(["a"])).not.toThrow();
  expect(() => assertRealExamSourcesAllowed(["b"])).toThrow();
});
it("fails closed on unreadable records, while allowing material-free chat and recovery", () => {
  setSavedRealExamProtection([], true);
  expect(() => assertRealExamSourcesAllowed(["a"])).toThrow("기록");
  expect(() => assertRealExamSourcesAllowed([])).not.toThrow();
  setSavedRealExamProtection([]);
  expect(() => assertRealExamSourcesAllowed(["a"])).not.toThrow();
});
it("notifies request cancellation subscribers when a persisted protection changes", () => {
  const listener = vi.fn(); const stop = subscribeRealExamProtection(listener);
  setSavedRealExamProtection([exam("first", "a")]); expect(listener).toHaveBeenCalledTimes(1);
  setActiveRealExamProtection(null); expect(listener).toHaveBeenCalledTimes(1);
  stop(); setSavedRealExamProtection([]); expect(listener).toHaveBeenCalledTimes(1);
});
it("also protects a prior automatic wrong answer with the same original source", () => {
  const history = { ...exam("old", "a"), mode: "practice", status: "submitted" } as ExamSession;
  const wrong = { id: "old-wrong", generatedFromExamSessionId: "old", generatedFromQuestionNumber: "01번" } as WrongAnswerEntry;
  setSavedRealExamProtection([history, exam("new", "a")], false, [wrong]);
  expect(() => assertRealExamSourcesAllowed([wrong.id])).toThrow();
});
it("checks protected sources at the MCP boundary, including after the exam screen closes", async () => {
  setSavedRealExamProtection([exam("first", "a")]); setActiveRealExamProtection(null);
  await expect(syncMcpBridgeExportContext({ entryId: "a" } as McpExportContext)).rejects.toThrow("제출 후");
});
it("resolves unique legacy generated-session provenance before protecting sources", () => {
  const legacy = { ...exam("first", "unused"), questions: [{ id: "legacy-q", questionNumber: "1" }] } as ExamSession;
  const generated = { id: "first", questions: [{ position: 1, source: { sourceEntryId: "original", sourceQuestionNumber: "7" } }] } as GeneratedExam;
  setSavedRealExamProtection([legacy], false, [], [generated]);
  expect(() => assertRealExamSourcesAllowed(["original"])).toThrow();
});
