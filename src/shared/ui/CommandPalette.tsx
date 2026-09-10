import { useEffect, useMemo, useState } from "react";
import Dialog from "./Dialog";
import { reviewCommands } from "../../utils/reviewCommands";

export interface AppCommand {
  id: string;
  label: string;
  hint?: string;
  keywords?: string[];
  onExecute(): void;
}

function isEditableTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  return ["input", "textarea", "select", "button", "a", "summary"].includes(element.tagName.toLowerCase()) || element.isContentEditable || Boolean(element.closest("[role=dialog]"));
}

export default function CommandPalette({ commands }: { commands: AppCommand[] }) {
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    if (!normalized) return commands;
    return commands.filter((command) => [command.label, command.hint, ...(command.keywords ?? [])].filter(Boolean).join(" ").toLocaleLowerCase("ko-KR").includes(normalized));
  }, [commands, query]);
  const closePalette = () => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (open) {
        if (event.key === "Escape") {
          event.preventDefault();
          closePalette();
          return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          if (filtered.length) {
            setActiveIndex((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + filtered.length) % filtered.length);
          }
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          filtered[Math.min(activeIndex, Math.max(filtered.length - 1, 0))]?.onExecute();
          if (filtered.length) closePalette();
          return;
        }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && !isEditableTarget(event.target)) {
        const command = event.key.toLowerCase() === "n" ? commands.find((item) => item.id === "new-entry") : event.key.toLowerCase() === "i" ? commands.find((item) => item.id === "import") : undefined;
        if (command) {
          event.preventDefault();
          command.onExecute();
          return;
        }
      }
      if (isEditableTarget(event.target) || document.querySelector('[role="dialog"]')) return;
      if (event.key === "?") {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (event.key.toLowerCase() === "r") {
        commands.find((item) => item.id === "today-review")?.onExecute();
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>("[data-search-field]")?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, commands, filtered, open, query]);
  return <>
  <Dialog open={open} size="sm" ariaLabel="명령 팔레트" title="명령 팔레트" onClose={closePalette}>
    <div className="command-palette" data-dialog-editing="true">
      <input autoFocus type="search" value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} placeholder="명령 검색" aria-label="명령 검색" role="combobox" aria-controls="command-palette-list" aria-activedescendant={filtered[activeIndex] ? `command-${filtered[activeIndex].id}` : undefined} aria-expanded="true" />
      <div id="command-palette-list" role="listbox" aria-label="명령 목록">
        {filtered.length ? filtered.map((command, index) => <button id={`command-${command.id}`} key={command.id} type="button" role="option" aria-selected={index === activeIndex} onMouseEnter={() => setActiveIndex(index)} onClick={() => { closePalette(); command.onExecute(); }}><span>{command.label}</span>{command.hint && <small>{command.hint}</small>}</button>) : <p className="empty-state">일치하는 명령이 없습니다.</p>}
      </div>
    </div>
  </Dialog>
  <Dialog open={helpOpen} size="sm" ariaLabel="키보드 단축키" title="키보드 단축키" onClose={() => setHelpOpen(false)}>
    <div className="command-shortcuts">{reviewCommands.map((command) => <p key={command.key}><kbd>{command.label}</kbd><span>{command.description}</span></p>)}</div>
  </Dialog>
  </>;
}
