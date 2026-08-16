import { useMemo, useState } from "react";
import type { LibraryFolder, LibraryPreferences, WrongAnswerEntry } from "../../../types";
import { getLibraryResourceGroup, projectLibraryResource, resourceTypeLabel } from "../../../utils/libraryClassification";

export interface LibraryExplorerProps {
  folders: LibraryFolder[];
  entries: WrongAnswerEntry[];
  preferences?: LibraryPreferences;
  onOpenEntry(entryId: string): void;
  onCreateFolder(parentId?: string): void;
  onRenameFolder(folder: LibraryFolder): void;
  onMoveFolder(folder: LibraryFolder, parentId?: string): void;
  onMoveEntries(entryIds: string[], folderId?: string): void;
  onDeleteFolder(folder: LibraryFolder): void;
}

type ResourceGroup = "all" | "특강" | "기출" | "N제" | "모의고사" | "미분류";
type SortKey = "name" | "updated" | "created" | "type";

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

function EntryRow({ entry, separateMockExams, onOpen }: { entry: WrongAnswerEntry; separateMockExams: boolean; onOpen(): void }) {
  const projection = projectLibraryResource(entry, { separateMockExams });
  return <button type="button" draggable className="library-resource-row" onDragStart={(event) => event.dataTransfer.setData("application/x-entry-ids", entry.id)} onClick={onOpen}>
    <span className="library-resource-name">{entry.title || "제목 없음"}</span>
    <span className="library-resource-type">{getLibraryResourceGroup(entry, { separateMockExams })}</span>
    <span className="library-resource-subject">{projection.classification.subject}</span>
    <span className="library-resource-count">{countQuestions(entry)}문항</span>
    <time dateTime={entry.updatedAt}>{new Date(entry.updatedAt).toLocaleDateString("ko-KR")}</time>
  </button>;
}

export default function LibraryExplorer({ folders, entries, preferences, onOpenEntry, onCreateFolder, onRenameFolder, onMoveFolder, onMoveEntries, onDeleteFolder }: LibraryExplorerProps) {
  const libraryPreferences = preferences ?? { separateMockExams: false, defaultUnitView: "home" as const, listDensity: "standard" as const, showUserFolders: true };
  const [subject, setSubject] = useState<string | null>(null); const [course, setCourse] = useState<string | null>(null); const [unit, setUnit] = useState<string | null>(null);
  const [resourceGroup, setResourceGroup] = useState<ResourceGroup>("all"); const [search, setSearch] = useState(""); const [sort, setSort] = useState<SortKey>("updated");
  const [showFolders, setShowFolders] = useState(libraryPreferences.showUserFolders); const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(); const [folderExpanded, setFolderExpanded] = useState<Set<string>>(new Set());
  const projections = useMemo(() => entries.map((entry) => projectLibraryResource(entry, libraryPreferences)), [entries, libraryPreferences]);
  const subjects = useMemo(() => [...new Set(projections.map((item) => item.classification.subject))].sort((a, b) => a.localeCompare(b, "ko")), [projections]);
  const courses = useMemo(() => [...new Set(projections.filter((item) => !subject || item.classification.subject === subject).map((item) => item.classification.course).filter(Boolean))] as string[], [projections, subject]);
  const units = useMemo(() => [...new Set(projections.filter((item) => (!subject || item.classification.subject === subject) && (!course || item.classification.course === course)).map((item) => item.classification.unit).filter(Boolean))] as string[], [course, projections, subject]);
  const visible = useMemo(() => projections.filter((item) => { const c = item.classification; if (subject && c.subject !== subject) return false; if (course && c.course !== course) return false; if (unit && c.unit !== unit) return false; if (resourceGroup !== "all" && item.group !== resourceGroup) return false; const query = search.trim().toLocaleLowerCase("ko"); return !query || `${item.entry.title} ${item.entry.subject} ${c.unit ?? ""} ${item.entry.tags.join(" ")}`.toLocaleLowerCase("ko").includes(query); }).sort((a, b) => sort === "name" ? a.entry.title.localeCompare(b.entry.title, "ko") : sort === "created" ? b.entry.createdAt.localeCompare(a.entry.createdAt) : sort === "type" ? resourceTypeLabel(a.classification.resourceType).localeCompare(resourceTypeLabel(b.classification.resourceType), "ko") : b.entry.updatedAt.localeCompare(a.entry.updatedAt)), [course, projections, resourceGroup, search, sort, subject, unit]);
  const folderEntries = currentFolderId ? entries.filter((entry) => entry.folderId === currentFolderId) : [];
  const toggleFolder = (id: string) => setFolderExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const renderFolders = (parentId?: string, depth = 0) => childrenOf(folders, parentId).map((folder) => { const children = childrenOf(folders, folder.id); const open = folderExpanded.has(folder.id); return <li key={folder.id} className="library-folder-row" style={{ paddingLeft: `${depth * 12}px` }}><button type="button" className="library-folder-toggle" aria-label={`${folder.name} ${open ? "접기" : "펼치기"}`} onClick={() => toggleFolder(folder.id)}>{children.length ? (open ? "▾" : "▸") : "·"}</button><button type="button" className={currentFolderId === folder.id ? "is-active" : ""} onClick={() => setCurrentFolderId(folder.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const entryIds = event.dataTransfer.getData("application/x-entry-ids").split(",").filter(Boolean); const movedFolderId = event.dataTransfer.getData("application/x-folder-id"); if (entryIds.length) onMoveEntries(entryIds, folder.id); else if (movedFolderId) { const moved = folders.find((item) => item.id === movedFolderId); if (moved) onMoveFolder(moved, folder.id); } }}>{folder.name}</button><span className="library-folder-actions"><button type="button" aria-label={`${folder.name} 이름 변경`} onClick={() => onRenameFolder(folder)}>이름 변경</button><button type="button" aria-label={`${folder.name} 삭제`} onClick={() => onDeleteFolder(folder)}>삭제</button></span>{open && children.length ? <ul>{renderFolders(folder.id, depth + 1)}</ul> : null}</li>; });
  return <section className="library-explorer" aria-label="학습 자료 보관함">
    <aside className="library-subject-pane"><header className="library-pane-header"><div><span className="library-eyebrow">학습 자료</span><h2>보관함</h2></div><button type="button" className="btn-icon" aria-label="새 폴더" onClick={() => onCreateFolder(currentFolderId)}>+</button></header><button type="button" className={!subject && !course && !unit ? "library-nav-item is-active" : "library-nav-item"} onClick={() => { setSubject(null); setCourse(null); setUnit(null); }}>전체 자료 <span>{entries.length}</span></button><h3>과목</h3><nav aria-label="과목 목록">{subjects.map((item) => <button type="button" key={item} className={subject === item ? "library-nav-item is-active" : "library-nav-item"} onClick={() => { setSubject(item); setCourse(null); setUnit(null); }}>{item}<span>{projections.filter((p) => p.classification.subject === item).length}</span></button>)}</nav>{libraryPreferences.showUserFolders && showFolders && <section className="library-user-folders"><div className="library-section-heading"><h3>사용자 폴더</h3><button type="button" className="btn-icon" aria-label="사용자 폴더 접기" onClick={() => setShowFolders(false)}>−</button></div><ul>{renderFolders()}</ul></section>}{!showFolders && libraryPreferences.showUserFolders && <button type="button" className="library-nav-item" onClick={() => setShowFolders(true)}>사용자 폴더 표시</button>}</aside>
    <main className="library-resource-pane"><header className="library-resource-toolbar"><nav aria-label="보관함 경로"><button type="button" onClick={() => { setSubject(null); setCourse(null); setUnit(null); }}>보관함</button>{subject && <> <span>/</span><button type="button" onClick={() => { setCourse(null); setUnit(null); }}>{subject}</button></>}{course && <> <span>/</span><button type="button" onClick={() => setUnit(null)}>{course}</button></>}{unit && <><span>/</span><strong>{unit}</strong></>}</nav><div className="library-toolbar-controls"><input type="search" aria-label="보관함 검색" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="자료 검색" /><label>정렬<select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}><option value="updated">최근 열람</option><option value="name">이름</option><option value="created">추가일</option><option value="type">자료 유형</option></select></label></div></header>{subject && !course && courses.length > 0 && <section className="library-unit-outline"><h2>{subject}</h2><p>과목의 강의와 문제를 단원별로 탐색합니다.</p>{courses.map((item) => <button type="button" key={item} onClick={() => setCourse(item)}>{item}<span>{projections.filter((p) => p.classification.course === item && p.classification.subject === subject).length}개 자료</span></button>)}</section>}{course && !unit && units.length > 0 && <section className="library-unit-outline"><h2>{course}</h2>{units.map((item) => <button type="button" key={item} onClick={() => setUnit(item)}>{item}<span>{projections.filter((p) => p.classification.unit === item && p.classification.course === course).length}개 자료</span></button>)}</section>}{unit && <div className="library-group-tabs" role="tablist" aria-label="단원 자료 유형">{(["all", "특강", "기출", "N제", "모의고사", "미분류"] as ResourceGroup[]).map((group) => <button type="button" role="tab" aria-selected={resourceGroup === group} className={resourceGroup === group ? "is-active" : ""} key={group} onClick={() => setResourceGroup(group)}>{group === "all" ? "전체 자료" : group}</button>)}</div>}{currentFolderId && <div className="library-folder-context"><span>{folderPath(folders.find((folder) => folder.id === currentFolderId)!, folders).join(" / ")}</span><button type="button" onClick={() => setCurrentFolderId(undefined)}>단원 탐색으로 돌아가기</button>{folderEntries.map((entry) => <EntryRow key={entry.id} entry={entry} separateMockExams={libraryPreferences.separateMockExams} onOpen={() => onOpenEntry(entry.id)} />)}</div>}{!currentFolderId && <section className="library-resource-list" aria-label="자료 목록"><div className="library-list-heading"><div><h2>{unit ?? course ?? subject ?? "최근 자료"}</h2><p>{visible.length}개 자료</p></div></div>{visible.length ? visible.map((item) => <EntryRow key={item.entry.id} entry={item.entry} separateMockExams={libraryPreferences.separateMockExams} onOpen={() => onOpenEntry(item.entry.id)} />) : <p className="library-empty">이 위치에 표시할 자료가 없습니다.</p>}</section>}</main>
  </section>;
}
