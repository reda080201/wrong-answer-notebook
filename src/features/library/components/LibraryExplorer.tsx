import { useCallback, useEffect, useMemo, useState } from "react";
import type { LibraryFolder, LibraryNavigationGroup, LibraryNavigationPreference, LibraryPreferences, LearningResourceClassification, WrongAnswerEntry } from "../../../types";
import { compareLibraryClassifications, getLibraryResourceGroup, projectLibraryResource, resourceTypeLabel } from "../../../utils/libraryClassification";
import Dialog from "../../../shared/ui/Dialog";

export interface LibraryExplorerProps {
  folders: LibraryFolder[];
  entries: WrongAnswerEntry[];
  preferences?: LibraryPreferences;
  navigation?: LibraryNavigationPreference;
  onNavigationChange?(navigation: LibraryNavigationPreference): void;
  onOpenEntry(entryId: string): void;
  onCreateFolder(parentId?: string): void;
  onRenameFolder(folder: LibraryFolder): void;
  onMoveFolder(folder: LibraryFolder, parentId?: string): void;
  onMoveEntries(entryIds: string[], folderId?: string): void;
  onUpdateEntries?(entryIds: string[], patch: Partial<WrongAnswerEntry>): Promise<void> | void;
  onDeleteFolder(folder: LibraryFolder): void;
}

type ResourceGroup = LibraryNavigationGroup;
type SortKey = "name" | "updated" | "created" | "type";

const DEFAULT_LIBRARY_PREFERENCES: LibraryPreferences = {
  separateMockExams: false,
  defaultUnitView: "home",
  listDensity: "standard",
  showUserFolders: true,
};

function childrenOf(folders: LibraryFolder[], parentId?: string) {
  return folders.filter((folder) => (folder.parentId ?? undefined) === parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ko"));
}

function folderPath(folder: LibraryFolder, folders: LibraryFolder[]): string[] {
  const result = [folder.name]; let current = folder; const seen = new Set([folder.id]);
  while (current.parentId) { const parent = folders.find((item) => item.id === current.parentId); if (!parent || seen.has(parent.id)) break; result.unshift(parent.name); seen.add(parent.id); current = parent; }
  return result;
}

function countQuestions(entry: WrongAnswerEntry): number {
  return entry.structuredQuestions?.length ?? entry.answerKey?.length ?? (entry.entryKind === "problem_sheet" ? Math.max(1, entry.question.split(/\n(?=\s*(?:\d+|[①-⑳])[.)、:])/).filter(Boolean).length) : 1);
}

function EntryRow({ entry, separateMockExams, onOpen, selected, onSelect }: { entry: WrongAnswerEntry; separateMockExams: boolean; onOpen(): void; selected?: boolean; onSelect?(): void }) {
  const projection = projectLibraryResource(entry, { separateMockExams });
  return <div className={`library-resource-row${selected ? " is-selected" : ""}`} draggable onDragStart={(event) => event.dataTransfer.setData("application/x-entry-ids", entry.id)}><input type="checkbox" aria-label={`${entry.title || "제목 없음"} 선택`} checked={selected === true} onChange={onSelect} /><button type="button" className="library-resource-open" onClick={onOpen}>
    <span className="library-resource-name">{entry.title || "제목 없음"}</span>
    <span className="library-resource-type">{getLibraryResourceGroup(entry, { separateMockExams })}</span>
    <span className="library-resource-subject">{projection.classification.subject}</span>
    <span className="library-resource-count">{countQuestions(entry)}문항</span>
    <time dateTime={entry.updatedAt}>{new Date(entry.updatedAt).toLocaleDateString("ko-KR")}</time>
  </button></div>;
}

function groupForNavigation(navigation?: LibraryNavigationPreference): ResourceGroup {
  if (navigation?.group) return navigation.group;
  if (navigation?.section === "lectures") return "lectures";
  if (navigation?.section === "problems") return "problems";
  return "all";
}

function groupLabel(group: ResourceGroup): string {
  return { all: "전체", lectures: "특강", problems: "문제", past: "기출", nset: "N제", mocks: "모의고사", unclassified: "미분류" }[group];
}

export default function LibraryExplorer({ folders, entries, preferences, navigation, onNavigationChange, onOpenEntry, onCreateFolder, onRenameFolder, onMoveFolder, onMoveEntries, onUpdateEntries, onDeleteFolder }: LibraryExplorerProps) {
  const libraryPreferences = preferences ?? DEFAULT_LIBRARY_PREFERENCES;
  const [subject, setSubject] = useState<string | null>(navigation?.subject ?? null); const [course, setCourse] = useState<string | null>(navigation?.course ?? null); const [unit, setUnit] = useState<string | null>(navigation?.unit ?? null);
  const [resourceGroup, setResourceGroup] = useState<ResourceGroup>(() => groupForNavigation(navigation)); const [search, setSearch] = useState(""); const [sort, setSort] = useState<SortKey>("updated");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [unitHomeOpen, setUnitHomeOpen] = useState(Boolean(navigation?.unit && groupForNavigation(navigation) === "all"));
  const [classificationOpen, setClassificationOpen] = useState(false);
  const [classificationDraft, setClassificationDraft] = useState<LearningResourceClassification>({});
  const [clearFields, setClearFields] = useState<Set<keyof LearningResourceClassification>>(new Set());
  const [showFolders, setShowFolders] = useState(libraryPreferences.showUserFolders); const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(); const [folderExpanded, setFolderExpanded] = useState<Set<string>>(new Set());
  const updateNavigation = useCallback((next: { subject?: string | null; course?: string | null; unit?: string | null; group?: ResourceGroup }) => {
    const nextSubject = next.subject === undefined ? subject : next.subject;
    const nextCourse = next.course === undefined ? course : next.course;
    const nextUnit = next.unit === undefined ? unit : next.unit;
    const nextGroup = next.group ?? resourceGroup;
    if (next.group && next.group !== "all") setUnitHomeOpen(false);
    setSubject(nextSubject); setCourse(nextCourse); setUnit(nextUnit); setResourceGroup(nextGroup);
    onNavigationChange?.({ subject: nextSubject ?? undefined, course: nextCourse ?? undefined, unit: nextUnit ?? undefined, group: nextGroup });
  }, [course, onNavigationChange, resourceGroup, subject, unit]);
  useEffect(() => {
    setShowFolders(libraryPreferences.showUserFolders);
  }, [libraryPreferences.showUserFolders]);
  useEffect(() => {
    if (!navigation) return;
    setSubject(navigation.subject ?? null); setCourse(navigation.course ?? null); setUnit(navigation.unit ?? null); setResourceGroup(groupForNavigation(navigation)); setUnitHomeOpen(Boolean(navigation.unit && groupForNavigation(navigation) === "all"));
  }, [navigation, navigation?.course, navigation?.group, navigation?.section, navigation?.subject, navigation?.unit]);
  const projections = useMemo(() => entries.map((entry) => projectLibraryResource(entry, libraryPreferences)), [entries, libraryPreferences]);
  const subjects = useMemo(() => [...new Set(projections.map((item) => item.classification.subject))].sort((a, b) => a.localeCompare(b, "ko")), [projections]);
  const courses = useMemo(() => {
    const candidates = projections.filter((item) => !subject || item.classification.subject === subject);
    return [...new Set(candidates.map((item) => item.classification.course).filter(Boolean))].sort((left, right) => {
      const leftItem = candidates.find((item) => item.classification.course === left);
      const rightItem = candidates.find((item) => item.classification.course === right);
      return leftItem && rightItem
        ? compareLibraryClassifications(leftItem.classification, rightItem.classification, left ?? "", right ?? "")
        : (left ?? "").localeCompare(right ?? "", "ko");
    }) as string[];
  }, [projections, subject]);
  const units = useMemo(() => {
    const candidates = projections.filter((item) => (!subject || item.classification.subject === subject) && (!course || item.classification.course === course));
    return [...new Set(candidates.map((item) => item.classification.unit).filter(Boolean))].sort((left, right) => {
      const leftItem = candidates.find((item) => item.classification.unit === left);
      const rightItem = candidates.find((item) => item.classification.unit === right);
      return leftItem && rightItem
        ? compareLibraryClassifications(leftItem.classification, rightItem.classification, left ?? "", right ?? "")
        : (left ?? "").localeCompare(right ?? "", "ko");
    }) as string[];
  }, [course, projections, subject]);
  const visible = useMemo(() => projections.filter((item) => { const c = item.classification; if (subject && c.subject !== subject) return false; if (course && c.course !== course) return false; if (unit && c.unit !== unit) return false; if (resourceGroup === "lectures" && item.group !== "특강") return false; if (resourceGroup === "problems" && item.group === "특강") return false; if (resourceGroup === "past" && item.group !== "기출") return false; if (resourceGroup === "nset" && item.group !== "N제") return false; if (resourceGroup === "mocks" && item.group !== "모의고사") return false; if (resourceGroup === "unclassified" && item.group !== "미분류") return false; const query = search.trim().toLocaleLowerCase("ko"); return !query || `${item.entry.title} ${item.entry.subject} ${c.unit ?? ""} ${item.entry.tags.join(" ")}`.toLocaleLowerCase("ko").includes(query); }).sort((a, b) => sort === "name" ? a.entry.title.localeCompare(b.entry.title, "ko") : sort === "created" ? b.entry.createdAt.localeCompare(a.entry.createdAt) : sort === "type" ? resourceTypeLabel(a.classification.resourceType).localeCompare(resourceTypeLabel(b.classification.resourceType), "ko") : compareLibraryClassifications(a.classification, b.classification, a.entry.id, b.entry.id)), [course, projections, resourceGroup, search, sort, subject, unit]);
  const folderEntries = currentFolderId ? entries.filter((entry) => entry.folderId === currentFolderId) : [];
  const toggleFolder = (id: string) => setFolderExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const renderFolders = (parentId?: string, depth = 0) => childrenOf(folders, parentId).map((folder) => { const children = childrenOf(folders, folder.id); const open = folderExpanded.has(folder.id); return <li key={folder.id} className="library-folder-row" style={{ paddingLeft: `${depth * 12}px` }}><button type="button" className="library-folder-toggle" aria-label={`${folder.name} ${open ? "접기" : "펼치기"}`} onClick={() => toggleFolder(folder.id)}>{children.length ? (open ? "▾" : "▸") : "·"}</button><button type="button" className={currentFolderId === folder.id ? "is-active" : ""} onClick={() => setCurrentFolderId(folder.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const entryIds = event.dataTransfer.getData("application/x-entry-ids").split(",").filter(Boolean); const movedFolderId = event.dataTransfer.getData("application/x-folder-id"); if (entryIds.length) onMoveEntries(entryIds, folder.id); else if (movedFolderId) { const moved = folders.find((item) => item.id === movedFolderId); if (moved) onMoveFolder(moved, folder.id); } }}>{folder.name}</button><span className="library-folder-actions"><button type="button" aria-label={`${folder.name} 이름 변경`} onClick={() => onRenameFolder(folder)}>이름 변경</button><button type="button" aria-label={`${folder.name} 삭제`} onClick={() => onDeleteFolder(folder)}>삭제</button></span>{open && children.length ? <ul>{renderFolders(folder.id, depth + 1)}</ul> : null}</li>; });
  const unitProjections = projections.filter((item) => (!subject || item.classification.subject === subject) && (!course || item.classification.course === course) && (!unit || item.classification.unit === unit));
  const unitHome = useMemo(() => ({
    lectures: unitProjections.filter((item) => item.group === "특강"),
    past: unitProjections.filter((item) => item.group === "기출"),
    nset: unitProjections.filter((item) => item.group === "N제"),
    recent: [...unitProjections].sort((a, b) => b.entry.updatedAt.localeCompare(a.entry.updatedAt)).slice(0, 5),
  }), [unitProjections]);
  const openClassification = () => {
    const selected = entries.filter((entry) => selectedIds.has(entry.id));
    const values = (field: keyof LearningResourceClassification) => [...new Set(selected.map((entry) => entry.resourceClassification?.[field]).filter((value): value is string | number => typeof value === "string" || typeof value === "number"))];
    const next: LearningResourceClassification = {};
    (["subject", "course", "majorUnit", "unit", "subunit", "resourceType", "courseOrder", "majorUnitOrder", "unitOrder", "subunitOrder"] as Array<keyof LearningResourceClassification>).forEach((field) => {
      const fieldValues = values(field);
      if (fieldValues.length === 1) next[field] = fieldValues[0] as never;
    });
    setClassificationDraft(next); setClearFields(new Set()); setClassificationOpen(true);
  };
  const saveClassification = async () => {
    if (!onUpdateEntries || selectedIds.size === 0) return;
    const changed = Object.entries(classificationDraft).filter(([, value]) => value !== "").reduce<Record<string, unknown>>((result, [key, value]) => ({ ...result, [key]: value }), {});
    await Promise.all([...selectedIds].map((id) => onUpdateEntries([id], { resourceClassification: { ...(entries.find((entry) => entry.id === id)?.resourceClassification ?? {}), ...changed, ...Object.fromEntries([...clearFields].map((field) => [field, undefined])) } })));
    setClassificationOpen(false); setSelectedIds(new Set());
  };
  const visibleGroups: ResourceGroup[] = ["all", "lectures", "problems", "past", "nset", ...(libraryPreferences.separateMockExams ? ["mocks" as const] : []), "unclassified"];
  return <section className="library-explorer" aria-label="학습 자료 보관함">
    <aside className="library-subject-pane"><header className="library-pane-header"><div><span className="library-eyebrow">학습 자료</span><h2>보관함</h2></div><button type="button" className="btn-icon" aria-label="새 폴더" onClick={() => onCreateFolder(currentFolderId)}>+</button></header><button type="button" className={!subject && !course && !unit ? "library-nav-item is-active" : "library-nav-item"} onClick={() => updateNavigation({ subject: null, course: null, unit: null, group: "all" })}>전체 자료 <span>{entries.length}</span></button><h3>과목</h3><nav aria-label="과목 목록">{subjects.map((item) => <button type="button" key={item} className={subject === item ? "library-nav-item is-active" : "library-nav-item"} onClick={() => updateNavigation({ subject: item, course: null, unit: null, group: "all" })}>{item}<span>{projections.filter((p) => p.classification.subject === item).length}</span></button>)}</nav>{libraryPreferences.showUserFolders && showFolders && <section className="library-user-folders"><div className="library-section-heading"><h3>사용자 폴더</h3><button type="button" className="btn-icon" aria-label="사용자 폴더 접기" onClick={() => setShowFolders(false)}>−</button></div><ul>{renderFolders()}</ul></section>}{!showFolders && libraryPreferences.showUserFolders && <button type="button" className="library-nav-item" onClick={() => setShowFolders(true)}>사용자 폴더 표시</button>}</aside>
    <main className="library-resource-pane"><header className="library-resource-toolbar"><nav aria-label="보관함 경로"><button type="button" onClick={() => updateNavigation({ subject: null, course: null, unit: null, group: "all" })}>보관함</button>{subject && <> <span>/</span><button type="button" onClick={() => updateNavigation({ course: null, unit: null, group: "all" })}>{subject}</button></>}{course && <> <span>/</span><button type="button" onClick={() => updateNavigation({ unit: null, group: "all" })}>{course}</button></>}{unit && <><span>/</span><strong>{unit}</strong></>}</nav><div className="library-toolbar-controls"><input type="search" aria-label="보관함 검색" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="자료 검색" /><label>정렬<select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}><option value="updated">최근 수정</option><option value="name">이름</option><option value="created">추가일</option><option value="type">자료 유형</option></select></label></div></header>{subject && !course && courses.length > 0 && <section className="library-unit-outline"><h2>{subject}</h2><p>과목의 강의와 문제를 단원별로 탐색합니다.</p>{courses.map((item) => <button type="button" key={item} onClick={() => updateNavigation({ course: item, unit: null, group: "all" })}>{item}<span>{projections.filter((p) => p.classification.course === item && p.classification.subject === subject).length}개 자료</span></button>)}</section>}{course && !unit && units.length > 0 && <section className="library-unit-outline"><h2>{course}</h2>{units.map((item) => <button type="button" key={item} onClick={() => { const group = libraryPreferences.defaultUnitView === "lectures" ? "lectures" : libraryPreferences.defaultUnitView === "problems" ? "problems" : "all"; setUnitHomeOpen(group === "all"); updateNavigation({ unit: item, group }); }}>{item}<span>{projections.filter((p) => p.classification.unit === item && p.classification.course === course).length}개 자료</span></button>)}</section>}{unit && <div className="library-group-tabs" role="tablist" aria-label="단원 자료 유형">{visibleGroups.map((group) => <button type="button" role="tab" aria-selected={resourceGroup === group && !unitHomeOpen} className={resourceGroup === group && !unitHomeOpen ? "is-active" : ""} key={group} onClick={() => { setUnitHomeOpen(false); updateNavigation({ group }); }}>{groupLabel(group)}</button>)}</div>}{selectedIds.size > 0 && <div className="library-selection-bar" role="region" aria-label="자료 일괄 작업"><span>{selectedIds.size}개 자료 선택됨</span><button type="button" className="btn-primary btn-sm" onClick={openClassification} disabled={!onUpdateEntries}>분류 편집</button><button type="button" className="btn-secondary btn-sm" onClick={() => setSelectedIds(new Set())}>선택 해제</button></div>}{currentFolderId && <div className="library-folder-context"><span>{folderPath(folders.find((folder) => folder.id === currentFolderId)!, folders).join(" / ")}</span><button type="button" onClick={() => setCurrentFolderId(undefined)}>단원 탐색으로 돌아가기</button>{folderEntries.map((entry) => <EntryRow key={entry.id} entry={entry} separateMockExams={libraryPreferences.separateMockExams} selected={selectedIds.has(entry.id)} onSelect={() => setSelectedIds((current) => { const next = new Set(current); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next; })} onOpen={() => onOpenEntry(entry.id)} />)}</div>}{!currentFolderId && unitHomeOpen && unit && <section className="library-unit-home" aria-label={`${unit} 단원 홈`}><h2>{unit}</h2><p>이어서 볼 자료와 단원별 학습 자료를 빠르게 엽니다.</p><div className="library-unit-home-summary"><span>특강 {unitHome.lectures.length}개</span><span>기출 {unitHome.past.length}개</span><span>N제 {unitHome.nset.length}개</span></div><h3>최근 본 자료</h3><div className="library-unit-home-list">{unitHome.recent.map((item) => <EntryRow key={item.entry.id} entry={item.entry} separateMockExams={libraryPreferences.separateMockExams} selected={selectedIds.has(item.entry.id)} onSelect={() => setSelectedIds((current) => { const next = new Set(current); if (next.has(item.entry.id)) next.delete(item.entry.id); else next.add(item.entry.id); return next; })} onOpen={() => onOpenEntry(item.entry.id)} />)}</div><button type="button" className="btn-secondary btn-sm" onClick={() => setUnitHomeOpen(false)}>전체 자료 보기</button></section>}{!currentFolderId && !unitHomeOpen && <section className={`library-resource-list library-resource-list--${libraryPreferences.listDensity}`} aria-label="자료 목록"><div className="library-list-heading"><div><h2>{unit ?? course ?? subject ?? "최근 자료"}</h2><p>{visible.length}개 자료</p></div></div>{visible.length ? visible.map((item) => <EntryRow key={item.entry.id} entry={item.entry} separateMockExams={libraryPreferences.separateMockExams} selected={selectedIds.has(item.entry.id)} onSelect={() => setSelectedIds((current) => { const next = new Set(current); if (next.has(item.entry.id)) next.delete(item.entry.id); else next.add(item.entry.id); return next; })} onOpen={() => onOpenEntry(item.entry.id)} />) : <p className="library-empty">이 위치에 표시할 자료가 없습니다.</p>}</section>}</main>
    <Dialog open={classificationOpen} onClose={() => setClassificationOpen(false)} ariaLabel="자료 분류 편집" size="lg"><header className="modal-head"><h2>자료 분류 편집</h2><p>{selectedIds.size}개 자료에 적용</p></header><div className="library-classification-form">{([['subject','과목'],['course','course'],['majorUnit','대단원'],['unit','단원'],['subunit','소단원']] as const).map(([field, label]) => <label key={field}>{label}<input value={String(classificationDraft[field] ?? "")} placeholder="변경하지 않으면 기존 값 유지" onChange={(event) => { setClassificationDraft((current) => ({ ...current, [field]: event.target.value })); setClearFields((current) => { const next = new Set(current); next.delete(field); return next; }); }} /><button type="button" className="btn-secondary btn-sm" onClick={() => setClearFields((current) => { const next = new Set(current); if (next.has(field)) next.delete(field); else next.add(field); return next; })}>{clearFields.has(field) ? "분류 해제 예정" : "분류 해제"}</button></label>)}<label>자료 유형<select value={String(classificationDraft.resourceType ?? "")} onChange={(event) => { setClassificationDraft((current) => ({ ...current, resourceType: event.target.value as LearningResourceClassification["resourceType"] })); setClearFields((current) => { const next = new Set(current); next.delete("resourceType"); return next; }); }}><option value="">변경하지 않음</option>{Object.entries({ past_collection: "기출", official_mock: "공식 모의고사", education_office_mock: "공식 모의고사", nset: "N제", problem_set: "문제 세트", private_mock: "사설 모의고사", lecture: "특강", other: "미분류" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" className="btn-secondary btn-sm" onClick={() => setClearFields((current) => { const next = new Set(current); if (next.has("resourceType")) next.delete("resourceType"); else next.add("resourceType"); return next; })}>{clearFields.has("resourceType") ? "분류 해제 예정" : "분류 해제"}</button></label><fieldset><legend>계층 정렬 순서</legend>{([['courseOrder','course'],['majorUnitOrder','대단원'],['unitOrder','단원'],['subunitOrder','소단원']] as const).map(([field, label]) => <label key={field}>{label}<input type="number" min="0" step="1" value={classificationDraft[field] == null ? "" : String(classificationDraft[field])} placeholder="자동 정렬" onChange={(event) => { const value = event.target.value; setClassificationDraft((current) => ({ ...current, [field]: value === "" ? undefined : Number(value) })); }} /><button type="button" className="btn-secondary btn-sm" onClick={() => setClearFields((current) => { const next = new Set(current); if (next.has(field)) next.delete(field); else next.add(field); return next; })}>{clearFields.has(field) ? "순서 해제 예정" : "순서 해제"}</button></label>)}</fieldset></div><footer className="modal-actions"><button type="button" className="btn-secondary" onClick={() => setClassificationOpen(false)}>취소</button><button type="button" className="btn-primary" onClick={() => void saveClassification()} disabled={!onUpdateEntries}>저장</button></footer></Dialog>
  </section>;
}
