import type { ChangeEvent, ReactNode } from "react";
import { PROBLEM_SOURCE_LABELS } from "../../../utils/problemSource";
import type { QuestionBankFilters, QuestionBankItem } from "../model/questionBankTypes";

interface QuestionBankFilterBarProps {
  items: QuestionBankItem[];
  filters: QuestionBankFilters;
  onChange: (patch: Partial<QuestionBankFilters>) => void;
  onReset: () => void;
  disabled?: boolean;
}

function values(items: QuestionBankItem[], select: (item: QuestionBankItem) => string | undefined): string[] {
  return [...new Set(items.map(select).filter((item): item is string => Boolean(item)))].sort((a, b) => a.localeCompare(b, "ko"));
}

function Select({ value, onChange, children, label, disabled = false }: { value: string; onChange: (value: string) => void; children: ReactNode; label: string; disabled?: boolean }) {
  return <label className="question-bank-filter"><span>{label}</span><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}

function NumberFilter({ label, value, onChange, disabled = false }: { label: string; value: number | null; onChange: (value: number | null) => void; disabled?: boolean }) {
  return <label className="question-bank-filter question-bank-filter--number"><span>{label}</span><input type="number" min="1" max="100" disabled={disabled} value={value ?? ""} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value ? Math.max(1, Math.min(100, Number(event.target.value))) : null)} placeholder="전체" /></label>;
}

export default function QuestionBankFilterBar({ items, filters, onChange, onReset, disabled = false }: QuestionBankFilterBarProps) {
  const subjects = values(items, (item) => item.subject);
  const units = values(items, (item) => item.classification.unit);
  const subunits = values(items, (item) => item.classification.subunit);
  const concepts = [...new Set(items.flatMap((item) => item.classification.concepts ?? []))].sort((a, b) => a.localeCompare(b, "ko"));
  const years = values(items, (item) => item.source.examYear ? String(item.source.examYear) : undefined);
  const tags = [...new Set(items.flatMap((item) => item.classification.tags ?? []))].sort((a, b) => a.localeCompare(b, "ko"));
  const active = [
    filters.subject !== "all" && { label: filters.subject, patch: { subject: "all" } },
    filters.sourceType !== "all" && { label: PROBLEM_SOURCE_LABELS[filters.sourceType], patch: { sourceType: "all" } },
    filters.unit !== "all" && { label: filters.unit, patch: { unit: "all" } },
    filters.subunit !== "all" && { label: filters.subunit, patch: { subunit: "all" } },
    filters.concept !== "all" && { label: filters.concept, patch: { concept: "all" } },
    filters.minDifficulty !== null && { label: `난이도 ${filters.minDifficulty}+`, patch: { minDifficulty: null } },
    filters.minImportance !== null && { label: `중요도 ${filters.minImportance}+`, patch: { minImportance: null } },
    filters.minQuality !== null && { label: `품질 ${filters.minQuality}+`, patch: { minQuality: null } },
    filters.answerType !== "all" && { label: filters.answerType === "multiple_choice" ? "객관식" : filters.answerType === "short_answer" ? "단답형" : filters.answerType === "essay" ? "서술형" : "미분류", patch: { answerType: "all" } },
    filters.wrongOnly && { label: "오답", patch: { wrongOnly: false } },
    filters.answerState !== "all" && { label: filters.answerState === "has" ? "정답 있음" : "정답 없음", patch: { answerState: "all" } },
    filters.explanationState !== "all" && { label: filters.explanationState === "has" ? "해설 있음" : "해설 없음", patch: { explanationState: "all" } },
    filters.hasImages !== "all" && { label: filters.hasImages === "has" ? "이미지 있음" : "이미지 없음", patch: { hasImages: "all" } },
    filters.reviewDueOnly && { label: "복습 예정", patch: { reviewDueOnly: false } },
    filters.year !== "all" && { label: `${filters.year}년`, patch: { year: "all" } },
    filters.tag !== "all" && { label: filters.tag, patch: { tag: "all" } },
  ].filter(Boolean) as Array<{ label: string; patch: Partial<QuestionBankFilters> }>;

  return <section className="question-bank-filters" aria-label="문제 은행 필터">
    <div className="question-bank-filter-search"><input value={filters.search} onChange={(event) => onChange({ search: event.target.value })} placeholder="문제, 단원, 개념, 출처 검색" aria-label="문제 은행 검색" /><button type="button" className="btn-secondary" disabled={disabled} onClick={onReset}>초기화</button></div>
    <div className="question-bank-filter-grid">
      <Select label="과목" value={filters.subject} disabled={disabled} onChange={(subject) => onChange({ subject })}><option value="all">전체 과목</option>{subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}</Select>
      <Select label="출처" value={filters.sourceType} disabled={disabled} onChange={(sourceType) => onChange({ sourceType: sourceType as QuestionBankFilters["sourceType"] })}><option value="all">전체 출처</option>{Object.entries(PROBLEM_SOURCE_LABELS).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</Select>
      <Select label="단원" value={filters.unit} disabled={disabled} onChange={(unit) => onChange({ unit })}><option value="all">전체 단원</option>{units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</Select>
      <Select label="소단원" value={filters.subunit} disabled={disabled} onChange={(subunit) => onChange({ subunit })}><option value="all">전체 소단원</option>{subunits.map((subunit) => <option key={subunit} value={subunit}>{subunit}</option>)}</Select>
      <Select label="개념" value={filters.concept} disabled={disabled} onChange={(concept) => onChange({ concept })}><option value="all">전체 개념</option>{concepts.map((concept) => <option key={concept} value={concept}>{concept}</option>)}</Select>
      <Select label="답 유형" value={filters.answerType} disabled={disabled} onChange={(answerType) => onChange({ answerType: answerType as QuestionBankFilters["answerType"] })}><option value="all">전체 유형</option><option value="multiple_choice">객관식</option><option value="short_answer">단답형</option><option value="essay">서술형</option><option value="unknown">미분류</option></Select>
      <NumberFilter label="최소 난이도" value={filters.minDifficulty} disabled={disabled} onChange={(minDifficulty) => onChange({ minDifficulty })} />
      <NumberFilter label="최소 중요도" value={filters.minImportance} disabled={disabled} onChange={(minImportance) => onChange({ minImportance })} />
      <NumberFilter label="최소 품질" value={filters.minQuality} disabled={disabled} onChange={(minQuality) => onChange({ minQuality })} />
      <Select label="정답" value={filters.answerState} disabled={disabled} onChange={(answerState) => onChange({ answerState: answerState as QuestionBankFilters["answerState"] })}><option value="all">전체</option><option value="has">있음</option><option value="missing">없음</option></Select>
      <Select label="해설" value={filters.explanationState} disabled={disabled} onChange={(explanationState) => onChange({ explanationState: explanationState as QuestionBankFilters["explanationState"] })}><option value="all">전체</option><option value="has">있음</option><option value="missing">없음</option></Select>
      <Select label="이미지" value={filters.hasImages} disabled={disabled} onChange={(hasImages) => onChange({ hasImages: hasImages as QuestionBankFilters["hasImages"] })}><option value="all">전체</option><option value="has">있음</option><option value="missing">없음</option></Select>
      <Select label="출제 연도" value={filters.year} disabled={disabled} onChange={(year) => onChange({ year })}><option value="all">전체 연도</option>{years.map((year) => <option key={year} value={year}>{year}년</option>)}</Select>
      <Select label="태그" value={filters.tag} disabled={disabled} onChange={(tag) => onChange({ tag })}><option value="all">전체 태그</option>{tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</Select>
      <label className="question-bank-filter question-bank-filter--check"><input type="checkbox" disabled={disabled} checked={filters.wrongOnly} onChange={(event) => onChange({ wrongOnly: event.target.checked })} /> 오답만</label>
      <label className="question-bank-filter question-bank-filter--check"><input type="checkbox" disabled={disabled} checked={filters.reviewDueOnly} onChange={(event) => onChange({ reviewDueOnly: event.target.checked })} /> 복습 예정</label>
    </div>
    {active.length > 0 && <div className="question-bank-chips" aria-label="적용된 필터">{active.map((chip) => <button key={chip.label} type="button" disabled={disabled} onClick={() => onChange(chip.patch)}>{chip.label} <span aria-hidden="true">×</span></button>)}</div>}
  </section>;
}
