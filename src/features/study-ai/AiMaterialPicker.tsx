import { useMemo, useState } from "react";
import type { AiMaterial, AiSharing } from "./model";
import Menu from "../../shared/ui/Menu";
export const SHARING_LABELS: Record<keyof AiSharing, string> = { body: "본문·공통 지문", choices: "선택지", images: "그림", answers: "정답", explanations: "해설", memo: "개인 메모", learning: "학습 기록" };
export default function AiMaterialPicker({ available, selected, sharing, disabled, onChange, open, onOpenChange }: {
    available: AiMaterial[];
    selected: AiMaterial[];
    sharing: AiSharing;
    disabled?: boolean;
    open?: boolean;
    onOpenChange?(open: boolean): void;
    onChange(materials: AiMaterial[], sharing: AiSharing): void;
}) {
    const [search, setSearch] = useState("");
    const query = search.trim().toLocaleLowerCase("ko-KR");
    const groups = useMemo(() => [...new Set(available.map(m => m.source.sourceEntryId))].map(id => ({ id, title: available.find(m => m.source.sourceEntryId === id)!.source.sourceEntryTitle, items: available.filter(m => m.source.sourceEntryId === id) })), [available]);
    const visibleGroups = groups.map(group => ({ ...group, matches: group.items.filter(m => !query || `${group.title} ${m.source.sourceQuestionNumber} ${m.snapshot.question}`.toLocaleLowerCase("ko-KR").includes(query)) })).filter(group => group.matches.length > 0);
    const matches = visibleGroups.flatMap(group => group.matches);
    const addMaterials = (materials: AiMaterial[]) => onChange([...selected.filter(m => !materials.some(item => item.id === m.id)), ...materials], sharing);
    return <details className="ai-material-picker" open={open} onToggle={event => onOpenChange?.(event.currentTarget.open)}><summary>AI가 볼 자료: {selected.length ? `${selected.length}문항` : "없음"} · 범위 설정</summary>
    <fieldset disabled={disabled}><legend>전송할 정보</legend>{Object.entries(SHARING_LABELS).map(([key, label]) => <label key={key}><input type="checkbox" checked={sharing[key as keyof AiSharing]} onChange={e => onChange(selected, { ...sharing, [key]: e.target.checked })}/>{label}</label>)}</fieldset>
    <p>선택한 문항의 출처·단원·난이도·중요도는 함께 전송합니다. 본문과 부가 정보는 위 옵션을 따르며 정답·해설은 허용 확인 후 포함됩니다.</p>
    <div className="ai-material-search"><input aria-label="AI 첨부 자료 검색" placeholder="문제지·문항 검색" value={search} onChange={e => setSearch(e.target.value)}/>{search && <button type="button" className="btn-secondary btn-sm" onClick={() => setSearch("")}>검색 초기화</button>}</div>
    <div className="ai-inline-actions">
      {query ? <>
        <button type="button" className="btn-primary" disabled={disabled || !matches.length} onClick={() => addMaterials(matches)}>검색 결과 추가 ({matches.length}문항)</button>
        <Menu className="ai-material-add-menu" label="전체 자료" triggerAriaLabel="검색과 무관한 전체 자료 추가">
          <button type="button" disabled={disabled} onClick={() => addMaterials(available)}>전체 문제은행 추가 ({available.length}문항 · 검색과 무관)</button>
        </Menu>
      </> : <button type="button" disabled={disabled} onClick={() => onChange(available, sharing)}>전체 문제은행 선택 ({available.length})</button>}
      <button type="button" disabled={disabled} onClick={() => onChange([], sharing)}>모두 제거</button>
    </div>
    <div className="ai-material-list">{!visibleGroups.length ? <p role="status">검색 결과가 없습니다.</p> : visibleGroups.map(group => <details key={group.id}><summary>{group.title} · {group.matches.length}문항{query ? ` (검색 결과)` : ""}</summary><div className="ai-inline-actions">
      {query ? <>
        <button type="button" disabled={disabled} onClick={() => addMaterials(group.matches)}>검색된 문항 추가 ({group.matches.length})</button>
        <Menu className="ai-material-add-menu" label="전체 묶음" triggerAriaLabel={`${group.title} 검색과 무관한 전체 묶음 추가`}>
          <button type="button" disabled={disabled} onClick={() => addMaterials(group.items)}>전체 묶음 추가 ({group.items.length}문항 · 검색과 무관)</button>
        </Menu>
      </> : <button type="button" disabled={disabled} onClick={() => addMaterials(group.items)}>전체 묶음 추가 ({group.items.length})</button>}
    </div>{group.matches.map(m => <label key={m.id}><input type="checkbox" disabled={disabled} checked={selected.some(s => s.id === m.id)} onChange={e => onChange(e.target.checked ? [...selected, m] : selected.filter(s => s.id !== m.id), sharing)}/><span>{m.source.sourceQuestionNumber}번 · {m.snapshot.question.slice(0, 65)}</span></label>)}</details>)}
    {!!selected.length && <ul className="ai-selected-materials">{selected.map(m => <li key={m.id}>{m.source.sourceEntryTitle} · {m.source.sourceQuestionNumber}번 <button type="button" disabled={disabled} onClick={() => onChange(selected.filter(s => s.id !== m.id), sharing)} aria-label={`${m.source.sourceEntryTitle} ${m.source.sourceQuestionNumber}번 첨부 제거`}>제거</button></li>)}</ul>}
    </div>
  </details>;
}
