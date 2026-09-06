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
  return ["input", "textarea", "select"].includes(element.tagName.toLowerCase()) || element.isContentEditable || Boolean(element.closest("[role=dialog][data-dialog-editing='true']"));
}

export default function CommandPalette({ commands }: { commands: AppCommand[] }) {
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(true);
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
      if (isEditableTarget(event.target)) return;
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
  }, [commands]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    if (!normalized) return commands;
    return commands.filter((command) => [command.label, command.hint, ...(command.keywords ?? [])].filter(Boolean).join(" ").toLocaleLowerCase("ko-KR").includes(normalized));
  }, [commands, query]);
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);
  return <>
  <Dialog open={open} size="sm" ariaLabel="명령 팔레트" title="명령 팔레트" onClose={() => setOpen(false)}>
    <div className="command-palette" data-dialog-editing="true">
      <input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="명령 검색" aria-label="명령 검색" />
      <div role="listbox" aria-label="명령 목록">
        {filtered.length ? filtered.map((command) => <button key={command.id} type="button" role="option" onClick={() => { setOpen(false); command.onExecute(); }}><span>{command.label}</span>{command.hint && <small>{command.hint}</small>}</button>) : <p className="empty-state">일치하는 명령이 없습니다.</p>}
      </div>
    </div>
  </Dialog>
  <Dialog open={helpOpen} size="sm" ariaLabel="키보드 단축키" title="키보드 단축키" onClose={() => setHelpOpen(false)}>
    <div className="command-shortcuts">{reviewCommands.map((command) => <p key={command.key}><kbd>{command.label}</kbd><span>{command.description}</span></p>)}</div>
  </Dialog>
  </>;
}
