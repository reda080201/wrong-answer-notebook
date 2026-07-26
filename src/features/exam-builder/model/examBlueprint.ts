import type { ExamBlueprint, GeneratedExamPreset } from "../../../types";

function slots(count: number, ranges: Array<[number, number]>): ExamBlueprint["slots"] {
  return Array.from({ length: count }, (_, index) => {
    const ratio = count <= 1 ? 0 : index / (count - 1);
    const band = ranges[Math.min(ranges.length - 1, Math.floor(ratio * ranges.length))];
    return { position: index + 1, targetDifficultyMin: band[0], targetDifficultyMax: band[1], answerType: "any" };
  });
}

export const EXAM_BLUEPRINTS: Record<"mini" | "hard" | "unit" | "wrong_retry" | "suneung_math", ExamBlueprint> = {
  mini: { id: "mini-20", name: "20문항 미니 모의고사", totalQuestions: 20, slots: slots(20, [[1, 30], [31, 60], [61, 85], [86, 100]]) },
  hard: { id: "hard-10", name: "10문항 고난도 세트", totalQuestions: 10, slots: slots(10, [[61, 75], [76, 90], [86, 100]]) },
  unit: { id: "unit-focus", name: "단원 집중 시험", totalQuestions: 10, slots: slots(10, [[1, 40], [41, 70], [71, 100]]) },
  wrong_retry: { id: "wrong-retry", name: "오답 재시험", totalQuestions: 10, slots: slots(10, [[1, 100]]) },
  suneung_math: { id: "suneung-math-30", name: "수능형 수학 30문항", subject: "수학", totalQuestions: 30, totalPoints: 100, slots: slots(30, [[1, 35], [36, 60], [61, 82], [83, 100]]) },
};

export function defaultBlueprintForPreset(preset: GeneratedExamPreset, questionCount?: number): ExamBlueprint {
  const base = preset === "hard" ? EXAM_BLUEPRINTS.hard : preset === "wrong_retry" ? EXAM_BLUEPRINTS.wrong_retry : preset === "real_exam" ? EXAM_BLUEPRINTS.mini : EXAM_BLUEPRINTS.unit;
  if (!questionCount || questionCount === base.totalQuestions) return structuredClone(base);
  return { ...structuredClone(base), id: `${base.id}-${questionCount}`, totalQuestions: questionCount, slots: slots(questionCount, base.slots.map((slot) => [slot.targetDifficultyMin ?? 1, slot.targetDifficultyMax ?? 100])) };
}
