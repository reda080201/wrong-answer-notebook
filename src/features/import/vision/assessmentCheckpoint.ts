import { parseVisionAnalysis, validateStudyAssessment, type VisionAnalysis } from "./visionSchema";
import type { AssessmentRunEvidence, AssessmentStageCache } from "./assessmentFlow";

const KEY = "wrong-answer-notebook:vision-assessment-checkpoint-v1";
let pendingCheckpoint: AssessmentCheckpoint | undefined;
export interface AssessmentCheckpoint { version: 1; sourceHashes: string[]; analysis: VisionAnalysis; evidence: AssessmentRunEvidence; cache: AssessmentStageCache; observationParts?: VisionAnalysis[]; observationComplete?: boolean; }
export async function sourceHashes(files: File[]): Promise<string[]> {
  return Promise.all(files.map(async file => [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, "0")).join("")));
}
export function readAssessmentCheckpoint(hashes: string[]): AssessmentCheckpoint | undefined {
  const text = pendingCheckpoint ? JSON.stringify(pendingCheckpoint) : localStorage.getItem(KEY);
  if (!text) return undefined;
  if (new TextEncoder().encode(text).length > 20 * 1024 * 1024) throw new Error("보존한 평가 초안의 용량이 잘못되었습니다.");
  const value = JSON.parse(text) as AssessmentCheckpoint;
  if (value.version !== 1 || !Array.isArray(value.sourceHashes)) throw new Error("보존한 평가 초안을 읽지 못했습니다. 원본을 유지하고 초안을 확인하세요.");
  if (JSON.stringify(value.sourceHashes) !== JSON.stringify(hashes)) throw new Error("다른 원본의 평가 초안이 남아 있습니다. 기존 원본으로 평가를 이어가거나 평가 초안 폐기를 선택하세요.");
  if (value.observationParts !== undefined) {
    if (!Array.isArray(value.observationParts) || value.observationParts.length > 1000) throw new Error("관측 재개 기록이 잘못되었습니다.");
    value.observationParts.forEach(part => parseVisionAnalysis(JSON.stringify(part)));
  }
  const base = structuredClone(value.analysis);
  base.schemaVersion = "wrong-answer-notebook-vision-v1";
  for (const entry of base.entries) for (const q of entry.questions) {
    if (q.studyAssessment) validateStudyAssessment(q.studyAssessment);
    delete q.studyAssessment;
  }
  parseVisionAnalysis(JSON.stringify(base));
  if (!value.cache || typeof value.cache !== "object" || Object.keys(value.cache).length > 1000 || !value.evidence || !Array.isArray(value.evidence.stages)) throw new Error("평가 재개 기록을 검증하지 못했습니다.");
  return value;
}
export function writeAssessmentCheckpoint(value: AssessmentCheckpoint): void {
  const text = JSON.stringify(value);
  if (new TextEncoder().encode(text).length > 20 * 1024 * 1024) throw new Error("평가 초안 저장 한도를 넘었습니다. 현재 결과를 보존한 뒤 범위를 나누세요.");
  // Storage failure must stop the flow before the next paid request.
  pendingCheckpoint = structuredClone(value);
  try { localStorage.setItem(KEY, text); }
  catch (error) { throw new Error("평가 초안을 저장하지 못했습니다. 결과는 현재 창에 유지됩니다. 앱을 종료하지 말고 저장 공간을 확인한 뒤 다시 시도하세요.", { cause: error }); }
  pendingCheckpoint = undefined;
}
export function clearAssessmentCheckpoint(): void { localStorage.removeItem(KEY); pendingCheckpoint = undefined; }
