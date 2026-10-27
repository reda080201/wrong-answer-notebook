import { normalizeExamAnswer } from "../../exam/services/examScoring";
import { parseVisionAnalysis, strictJson, validateStudyAssessment, validateAssessmentStage, type VisionAnalysis, type VisionQuestion } from "./visionSchema";
import type { StudyAssessment } from "../../../models/studyAssessment";
import type { VisionProviderReceipt } from "../../../services/api/ai";
import v2Schema from "../../../../tools/diagram_pipeline/vision-v2.schema.json";
import assessmentPrompt from "./vision-prompt-v8_1.txt?raw";

export type SourceRole = "problem" | "answer" | "mixed";
export type AssessmentStage = "vision_observed" | "solution_attempted" | "scores_assessed" | "answer_compared" | "prepackage_validated";
export interface AssessmentRunEvidence { independent: boolean; stages: Array<{ stage: string; receipt: Omit<VisionProviderReceipt, "text"> }>; }
export type AssessmentStageCache = Record<string, VisionProviderReceipt>;
export type AssessmentRequest = (prompt: string, input: string, refs: VisionQuestion["source"][], stage?: AssessmentStage) => Promise<VisionProviderReceipt>;

function object(text: string): Record<string, unknown> {
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024) throw new Error("평가 응답 용량을 넘었습니다.");
  const value = strictJson(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("평가 응답은 JSON 객체여야 합니다.");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key)) || allowed.some(key => !Object.hasOwn(value, key))) throw new Error(`평가 단계 필드를 확인하세요: ${allowed.join(", ")}`);
}

/** The answer-bearing request is deliberately unavailable until both solution and scores are sealed. */
export async function runPrepackageAssessment(analysis: VisionAnalysis, request: AssessmentRequest, options: {
  answerRefs: VisionQuestion["source"][]; independent: boolean; signal: AbortSignal; progress(stage: AssessmentStage, current?: number, total?: number): void;
  cache?: AssessmentStageCache;
  checkpoint?(analysis: VisionAnalysis, evidence: AssessmentRunEvidence, cache: AssessmentStageCache): Promise<void>;
}): Promise<{ analysis: VisionAnalysis; evidence: AssessmentRunEvidence }> {
  const result = structuredClone(analysis);
  const evidence: AssessmentRunEvidence = { independent: options.independent, stages: [] };
  const cache: AssessmentStageCache = { ...options.cache };
  let currentQuestion = 0;
  const totalQuestions = result.entries.reduce((sum, entry) => sum + entry.questions.length, 0);
  if (!totalQuestions) throw new Error("평가할 문항이 없습니다. 원본 관측을 먼저 검토하세요.");
  const stageKeys = new Map<AssessmentStage, string>();
  const rule = v2Schema.properties.entries.items.properties.questions.items.properties.studyAssessment;
  const call = async (stage: AssessmentStage, prompt: string, input: unknown, refs: VisionQuestion["source"][]) => {
    options.signal.throwIfAborted();
    options.progress(stage, currentQuestion, totalQuestions);
    const inputText = JSON.stringify(input);
    const cacheKey = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([stage, prompt, inputText, refs]))))].map(byte => byte.toString(16).padStart(2, "0")).join("");
    stageKeys.set(stage, cacheKey);
    const response = cache[cacheKey] ?? await request(`${assessmentPrompt}\n${prompt}\nJSON 객체만 반환하세요.`, inputText, refs, stage);
    options.signal.throwIfAborted();
    if (response.provider !== "openai" || !response.model.startsWith("gpt-") || !response.providerRequestId) throw new Error("GPT 실행 출처를 확인하지 못했습니다.");
    const { text, ...receipt } = response;
    evidence.stages.push({ stage, receipt });
    const parsed = object(text);
    try { validateAssessmentStage(stage, parsed); } catch (error) { delete cache[cacheKey]; throw error; }
    cache[cacheKey] = response;
    await options.checkpoint?.(result, evidence, cache);
    return parsed;
  };
  options.progress("vision_observed");
  for (const entry of result.entries) for (const q of entry.questions) {
    currentQuestion++;
    const refs = [q.source, ...(q.sourceRefs ?? [])];
    const question = { entryKey: entry.entryKey, questionKey: q.questionKey, questionNumber: q.questionNumber, questionText: q.questionText, contentSegments: q.contentSegments, choices: q.choices };
    const solved = await call("solution_attempted", `정답지를 보지 않고 첨부 문제를 직접 풀어 보세요. 반환 필드: assessmentStatus(solved|partially_solved|unsolved|unreadable), solution, warnings. solution 스키마: ${JSON.stringify(rule.properties.solution)}. 읽을 수 없으면 proposedAnswer:null, 미해결 이유를 warnings에 적으세요. 학생에게 보여줄 핵심 풀이·전략·검산 요약만 작성하세요.`, question, refs);
    keys(solved, ["assessmentStatus", "solution", "warnings"]);
    options.progress("solution_attempted");
    const scored = await call("scores_assessed", `문항과 보존된 풀이를 바탕으로 난이도와 중요도를 독립 평가하세요. 정답을 새로 바꾸지 마세요. 반환 필드: scores, classification, learning. 스키마: ${JSON.stringify({ scores: rule.properties.scores, classification: rule.properties.classification, learning: rule.properties.learning })}. 난이도: 추론30+개념결합25+계산20+아이디어15+조건해석10. 중요도: 핵심개념30+전이25+학습활용20+오개념교정15+복습효율10. 정수1~100, 각 이유2~5개·신뢰도0~100. 판단 불가하면 null과 실제 이유, 임의50점 금지. unreadable은 두 점수 null.`, { question, ...solved }, refs);
    keys(scored, ["scores", "classification", "learning"]);
    options.progress("scores_assessed");
    const sourceAnswer: StudyAssessment["sourceAnswer"] = { status: "not_provided", value: null, explanation: null };
    const assessment = { stage: "pre_package", evaluator: "gpt", ...solved, ...scored, sourceAnswer };
    try { validateStudyAssessment(assessment); } catch (error) { const key = stageKeys.get("scores_assessed"); if (key) delete cache[key]; await options.checkpoint?.(result, evidence, cache); throw error; }
    q.studyAssessment = assessment;
    // Do not carry observation-stage answer leakage into the independently sealed result.
    delete q.extractedAnswer; delete q.explanationDraft;
    await options.checkpoint?.(result, evidence, cache);
  }
  currentQuestion = 0;
  for (const entry of result.entries) for (const q of entry.questions) {
    currentQuestion++;
    const a = q.studyAssessment!;
    if (!options.answerRefs.length) continue;
    a.sourceAnswer = { status: "unreadable", value: null, explanation: null };
    for (let offset = 0; offset < options.answerRefs.length; offset += 3) {
      const refs = options.answerRefs.slice(offset, offset + 3);
      const compared = await call("answer_compared", `이제 첨부 답안지에서 해당 문항의 정답을 찾아 보존된 풀이 답과 대조하세요. sourceAnswer 한 필드만 반환. 스키마: ${JSON.stringify(rule.properties.sourceAnswer)}. 번호만 같은 다른 자료와 연결하지 마세요. 명확한 sourceKey/page가 없으면 status:unreadable,value:null.`, { question: { entryKey: entry.entryKey, title: entry.title, questionKey: q.questionKey, questionNumber: q.questionNumber, questionText: q.questionText, choices: q.choices }, solution: a.solution, allowedSources: refs }, refs);
      keys(compared, ["sourceAnswer"]);
      const answer = compared.sourceAnswer as StudyAssessment["sourceAnswer"];
      if (answer.sourceKey && !refs.some(ref => ref.sourceKey === answer.sourceKey && ref.page === answer.page)) throw new Error("정답 출처가 허용한 답안 페이지 밖입니다.");
      if (answer.value && answer.sourceKey) {
        answer.status = a.solution.proposedAnswer ? normalizeExamAnswer(answer.value) === normalizeExamAnswer(a.solution.proposedAnswer) ? "matched" : "conflict" : "source_only";
        a.sourceAnswer = answer;
        break;
      }
    }
    try { validateStudyAssessment(a); } catch (error) { const key = stageKeys.get("answer_compared"); if (key) delete cache[key]; await options.checkpoint?.(result, evidence, cache); throw error; }
    await options.checkpoint?.(result, evidence, cache);
  }
  result.schemaVersion = "wrong-answer-notebook-vision-v2";
  const validated = parseVisionAnalysis(JSON.stringify(result));
  options.progress("prepackage_validated");
  return { analysis: validated, evidence };
}
