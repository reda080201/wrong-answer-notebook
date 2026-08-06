import { useMemo, useState } from "react";
import type { LibraryFolder, WrongAnswerEntry } from "../../../types";

export interface LibraryExplorerProps {
  folders: LibraryFolder[];
  entries: WrongAnswerEntry[];
  onOpenEntry(entryId: string): void;
  onCreateFolder(parentId?: string): void;
  onRenameFolder(folder: LibraryFolder): void;
  onMoveFolder(folder: LibraryFolder, parentId?: string): void;
  onMoveEntries(entryIds: string[], folderId?: string): void;
  onDeleteFolder(folder: LibraryFolder): void;
}

function childrenOf(folders: LibraryFolder[], parentId?: string) {
  return folders.filter((folder) => (folder.parentId ?? undefined) === parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ko"));
}

function folderPath(folder: LibraryFolder, folders: LibraryFolder[]): string[] {
  const result = [folder.name]; let current = folder;
  const seen = new Set([folder.id]);
  while (current.parentId) { const parent = folders.find((item) => item.id === current.parentId); if (!parent || seen.has(parent.id)) break; result.unshift(parent.name); seen.add(parent.id); current = parent; }
  return result;
}

export default function LibraryExplorer({ folders, entries, onOpenEntry, onCreateFolder, onRenameFolder, onMoveFolder, onMoveEntries, onDeleteFolder }: LibraryExplorerProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const current = folders.find((folder) => folder.id === currentFolderId);
  const visibleEntries = useMemo(() => entries.filter((entry) => {
    const actual = folders.some((folder) => folder.id === entry.folderId) ? entry.folderId : undefined;
    const text = `${entry.title} ${entry.subject} ${entry.tags.join(" ")}`.toLocaleLowerCase("ko");
    return actual === currentFolderId && (!search.trim() || text.includes(search.trim().toLocaleLowerCase("ko")));
  }), [currentFolderId, entries, folders, search]);
  const recent = useMemo(() => [...entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12), [entries]);
  const renderFolder = (folder: LibraryFolder, depth = 0): React.ReactNode => {
    const children = childrenOf(folders, folder.id); const open = expanded.has(folder.id);
    return <li key={folder.id} className="library-tree-row" style={{ paddingLeft: depth * 14 }}>
      <button type="button" className="btn-icon" aria-label={`${folder.name} ${open ? "접기" : "펼치기"}`} onClick={() => setExpanded((currentSet) => { const next = new Set(currentSet); if (open) next.delete(folder.id); else next.add(folder.id); return next; })}>{children.length ? (open ? "▾" : "▸") : "·"}</button>
      <button type="button" className={currentFolderId === folder.id ? "active" : ""} draggable onDragStart={(event) => event.dataTransfer.setData("application/x-folder-id", folder.id)} onClick={() => setCurrentFolderId(folder.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const ids = event.dataTransfer.getData("application/x-entry-ids").split(",").filter(Boolean); const movedFolderId = event.dataTransfer.getData("application/x-folder-id"); if (ids.length) onMoveEntries(ids, folder.id); else if (movedFolderId) { const moved = folders.find((item) => item.id === movedFolderId); if (moved) onMoveFolder(moved, folder.id); } }}>{folder.name}</button>
      {folder.parentId && <button type="button" className="btn-icon" aria-label={`${folder.name} 루트로 이동`} onClick={() => onMoveFolder(folder, undefined)}>⌂</button>}
      <button type="button" className="btn-icon" aria-label={`${folder.name} 이름 변경`} onClick={() => onRenameFolder(folder)}>✎</button>
      <button type="button" className="btn-icon" aria-label={`${folder.name} 폴더 삭제`} onClick={() => onDeleteFolder(folder)}>×</button>
      {open && children.length ? <ul>{children.map((child) => renderFolder(child, depth + 1))}</ul> : null}
    </li>;
  };
  return <section className="library-explorer" aria-label="문제지 파일 탐색기">
    <aside className="library-tree"><header><h2>보관함</h2><button type="button" className="btn-icon" aria-label="새 폴더" onClick={() => onCreateFolder(currentFolderId)}>+</button></header><button type="button" className={!currentFolderId ? "active" : ""} onClick={() => setCurrentFolderId(undefined)}>루트</button><button type="button" onClick={() => setCurrentFolderId(undefined)}>미분류 항목</button><ul>{childrenOf(folders).map((folder) => renderFolder(folder))}</ul></aside>
    <main className="library-content"><header><nav aria-label="폴더 경로">루트{current ? ` / ${folderPath(current, folders).join(" / ")}` : ""}</nav><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="보관함 검색" /><button type="button" className="btn-secondary" onClick={() => setCurrentFolderId(undefined)}>루트로 이동</button></header>{!currentFolderId && !search.trim() ? <section><h3>최근 항목</h3><div className="library-entry-grid">{recent.map((entry) => <button key={entry.id} type="button" onClick={() => onOpenEntry(entry.id)}>{entry.title || "제목 없음"}<small>{entry.subject}</small></button>)}</div></section> : <section><h3>{current?.name ?? "미분류 항목"}</h3><div className="library-entry-grid">{visibleEntries.map((entry) => <button key={entry.id} type="button" draggable onDragStart={(event) => event.dataTransfer.setData("application/x-entry-ids", entry.id)} onClick={() => onOpenEntry(entry.id)}>{entry.title || "제목 없음"}<small>{entry.subject} · {new Date(entry.updatedAt).toLocaleDateString("ko-KR")}</small></button>)}</div></section>}</main>
  </section>;
}
