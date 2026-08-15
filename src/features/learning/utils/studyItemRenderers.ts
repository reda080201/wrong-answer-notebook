import type { ResolvedStudyItem } from "./studyItems";
import type { LearningSubjectDomain } from "../../../types";

export interface StudyItemRenderer { id: string; matches(item: ResolvedStudyItem): boolean; render(item: ResolvedStudyItem): { label: string; sections: Array<{ title: string; text: string }> }; }

const defaultRenderer: StudyItemRenderer = { id: "default", matches: () => true, render: (item) => ({ label: item.title, sections: [{ title: "내용", text: item.prompt }] }) };
const mathRenderer: StudyItemRenderer = { id: "math", matches: (item) => item.block?.subjectDomain === "math", render: (item) => ({ label: item.title, sections: [{ title: "핵심 내용", text: item.prompt }] }) };
const lifeEthicsRenderer: StudyItemRenderer = { id: "life_ethics", matches: (item) => item.block?.subjectDomain === "life_ethics", render: (item) => ({ label: item.title, sections: [{ title: "주장과 근거", text: item.prompt }] }) };

const registry: StudyItemRenderer[] = [mathRenderer, lifeEthicsRenderer, defaultRenderer];
export function getStudyItemRenderer(subject?: LearningSubjectDomain): StudyItemRenderer {
  return registry.find((renderer) => renderer.id === subject) ?? defaultRenderer;
}
