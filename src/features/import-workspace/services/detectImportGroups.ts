import type { ImportDraftGroup, ImportQuestionDraft, ImportSourceFile } from "../model/importWorkspace";

const roundPattern = /(?:모의고사|시험|회차|회|day|weekly)[\s_-]*(\d{1,3})/i;
export function detectRoundLabel(value: string): { label?: string; confidence: number } {
  const match = value.match(roundPattern);
  return match ? { label: match[1], confidence: /모의고사|시험/.test(value) ? .94 : .82 } : { confidence: .25 };
}
export function detectImportGroups(files: ImportSourceFile[], questions: ImportQuestionDraft[]): { groups: ImportDraftGroup[]; warnings: string[] } {
  const groups = new Map<string, ImportDraftGroup>();
  for (const file of files) {
    const detected = detectRoundLabel(file.name);
    const key = detected.label ? `round-${detected.label}` : "unassigned";
    const group = groups.get(key) ?? { id: key, title: detected.label ? `${file.name.replace(/\.[^.]+$/, "")} 회차` : "미분류", roundLabel: detected.label, detectedTitle: file.name, confidence: detected.confidence, questions: [], answerItems: [], sourceFileIds: [], userConfirmed: false };
    group.sourceFileIds.push(file.id); groups.set(key, group);
  }
  const output = [...groups.values()];
  for (const question of questions) (output.find((group) => group.id === question.groupId) ?? output[0])?.questions.push(question);
  return { groups: output, warnings: output.filter((group) => (group.confidence ?? 0) < .85).map((group) => `${group.title}의 회차 감지 신뢰도가 낮습니다.`) };
}

export function suggestRoundBreaks(numbers: string[]): number[] {
  const breaks: number[] = [];
  for (let index = 1; index < numbers.length; index += 1) if (Number(numbers[index]) === 1 && Number(numbers[index - 1]) > 1) breaks.push(index);
  return breaks;
}
