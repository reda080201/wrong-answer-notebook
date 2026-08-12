import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
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

type LibraryView = "recent" | "unclassified" | "folder";

function flattenVisibleFolders(folders: LibraryFolder[], expanded: Set<string>) {
  const result: Array<{ folder: LibraryFolder; depth: number }> = [];
  const visit = (parentId: string | undefined, depth: number) => {
    for (const folder of childrenOf(folders, parentId)) {
      result.push({ folder, depth });
      if (expanded.has(folder.id)) visit(folder.id, depth + 1);
    }
  };
  visit(undefined, 0);
  return result;
}

export default function LibraryExplorer({ folders, entries, onOpenEntry, onCreateFolder, onRenameFolder, onMoveFolder, onMoveEntries, onDeleteFolder }: LibraryExplorerProps) {
  const [view, setView] = useState<LibraryView>("recent");
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>();
  const [focusedFolderId, setFocusedFolderId] = useState<string | undefined>();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const folderRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const current = folders.find((folder) => folder.id === currentFolderId);
  const visibleFolders = useMemo(() => flattenVisibleFolders(folders, expanded), [expanded, folders]);
  const visibleEntries = useMemo(() => entries.filter((entry) => {
    const actual = folders.some((folder) => folder.id === entry.folderId) ? entry.folderId : undefined;
    const text = `${entry.title} ${entry.subject} ${entry.tags.join(" ")}`.toLocaleLowerCase("ko");
    const matchesSearch = !search.trim() || text.includes(search.trim().toLocaleLowerCase("ko"));
    if (view === "unclassified") return actual === undefined && matchesSearch;
    if (view === "folder") return actual === currentFolderId && matchesSearch;
    return matchesSearch;
  }), [currentFolderId, entries, folders, search, view]);
  const recent = useMemo(() => [...visibleEntries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12), [visibleEntries]);

  useEffect(() => {
    if (view !== "folder" || !currentFolderId) return;
    folderRefs.current[currentFolderId]?.focus();
  }, [currentFolderId, view]);

  const selectFolder = (folderId: string) => {
    setView("folder");
    setCurrentFolderId(folderId);
    setFocusedFolderId(folderId);
  };

  const toggleFolder = (folderId: string) => {
    setExpanded((currentSet) => {
      const next = new Set(currentSet);
      if (next.has(folderId)) next.delete(folderId); else next.add(folderId);
      return next;
    });
  };

  const handleFolderKeyDown = (event: KeyboardEvent<HTMLLIElement>, folder: LibraryFolder) => {
    if (event.currentTarget !== event.target) return;
    const currentIndex = visibleFolders.findIndex((item) => item.folder.id === folder.id);
    if (currentIndex < 0) return;
    const children = childrenOf(folders, folder.id);
    const open = expanded.has(folder.id);
    let target: LibraryFolder | undefined;
    switch (event.key) {
      case "ArrowDown":
        target = visibleFolders[currentIndex + 1]?.folder;
        break;
      case "ArrowUp":
        target = visibleFolders[currentIndex - 1]?.folder;
        break;
      case "Home":
        target = visibleFolders[0]?.folder;
        break;
      case "End":
        target = visibleFolders[visibleFolders.length - 1]?.folder;
        break;
      case "ArrowRight":
        if (children.length && !open) {
          event.preventDefault();
          toggleFolder(folder.id);
          return;
        }
        target = children[0];
        break;
      case "ArrowLeft":
        if (open) {
          event.preventDefault();
          toggleFolder(folder.id);
          return;
        }
        target = folder.parentId ? folders.find((item) => item.id === folder.parentId) : undefined;
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        selectFolder(folder.id);
        return;
      default:
        return;
    }
    if (!target) return;
    event.preventDefault();
    selectFolder(target.id);
  };

  const renderFolder = (folder: LibraryFolder, depth = 0): ReactNode => {
    const children = childrenOf(folders, folder.id); const open = expanded.has(folder.id);
    const initialTreeItem = visibleFolders[0]?.folder.id;
    return <li key={folder.id} className="library-tree-row" style={{ paddingLeft: depth * 14 }} role="treeitem" aria-level={depth + 1} aria-expanded={children.length ? open : undefined} aria-selected={currentFolderId === folder.id} tabIndex={focusedFolderId === folder.id || (!focusedFolderId && folder.id === initialTreeItem) ? 0 : -1} ref={(node) => { folderRefs.current[folder.id] = node; }} onFocus={() => setFocusedFolderId(folder.id)} onKeyDown={(event) => handleFolderKeyDown(event, folder)}>
      <button type="button" className="btn-icon" tabIndex={-1} aria-label={`${folder.name} ${open ? "접기" : "펼치기"}`} onClick={() => toggleFolder(folder.id)}>{children.length ? (open ? "▾" : "▸") : "·"}</button>
      <button type="button" tabIndex={-1} className={currentFolderId === folder.id ? "active" : ""} draggable onDragStart={(event) => event.dataTransfer.setData("application/x-folder-id", folder.id)} onClick={() => selectFolder(folder.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const ids = event.dataTransfer.getData("application/x-entry-ids").split(",").filter(Boolean); const movedFolderId = event.dataTransfer.getData("application/x-folder-id"); if (ids.length) onMoveEntries(ids, folder.id); else if (movedFolderId) { const moved = folders.find((item) => item.id === movedFolderId); if (moved) onMoveFolder(moved, folder.id); } }}>{folder.name}</button>
      {folder.parentId && <button type="button" tabIndex={-1} className="btn-icon" aria-label={`${folder.name} 루트로 이동`} onClick={() => onMoveFolder(folder, undefined)}>⌂</button>}
      <button type="button" tabIndex={-1} className="btn-icon" aria-label={`${folder.name} 이름 변경`} onClick={() => onRenameFolder(folder)}>✎</button>
      <button type="button" tabIndex={-1} className="btn-icon" aria-label={`${folder.name} 폴더 삭제`} onClick={() => onDeleteFolder(folder)}>×</button>
      {open && children.length ? <ul role="group">{children.map((child) => renderFolder(child, depth + 1))}</ul> : null}
    </li>;
  };
  return <section className="library-explorer" aria-label="문제지 파일 탐색기">
    <aside className="library-tree"><header><h2>보관함</h2><button type="button" className="btn-icon" aria-label="새 폴더" onClick={() => onCreateFolder(view === "folder" ? currentFolderId : undefined)}>+</button></header><button type="button" className={view === "recent" ? "active" : ""} onClick={() => { setView("recent"); setCurrentFolderId(undefined); }}>루트</button><button type="button" className={view === "unclassified" ? "active" : ""} onClick={() => { setView("unclassified"); setCurrentFolderId(undefined); }}>미분류 항목</button><ul role="tree" aria-label="폴더">{childrenOf(folders).map((folder) => renderFolder(folder))}</ul></aside>
    <main className="library-content"><header><nav aria-label="폴더 경로">루트{view === "folder" && current ? ` / ${folderPath(current, folders).join(" / ")}` : ""}</nav><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="보관함 검색" /><button type="button" className="btn-secondary" onClick={() => { setView("recent"); setCurrentFolderId(undefined); }}>루트로 이동</button></header>{view === "recent" ? <section><h3>최근 항목</h3><div className="library-entry-grid">{recent.map((entry) => <button key={entry.id} type="button" onClick={() => onOpenEntry(entry.id)}>{entry.title || "제목 없음"}<small>{entry.subject}</small></button>)}</div></section> : <section><h3>{current?.name ?? "미분류 항목"}</h3><div className="library-entry-grid">{visibleEntries.map((entry) => <button key={entry.id} type="button" draggable onDragStart={(event) => event.dataTransfer.setData("application/x-entry-ids", entry.id)} onClick={() => onOpenEntry(entry.id)}>{entry.title || "제목 없음"}<small>{entry.subject} · {new Date(entry.updatedAt).toLocaleDateString("ko-KR")}</small></button>)}</div></section>}</main>
  </section>;
}
