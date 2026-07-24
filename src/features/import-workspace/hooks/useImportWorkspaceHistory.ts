import { useCallback, useState } from "react";
import type { ImportWorkspace } from "../model/importWorkspace";

const MAX_HISTORY = 100;

const clone = (workspace: ImportWorkspace): ImportWorkspace => structuredClone(workspace);

export function useImportWorkspaceHistory(initial: ImportWorkspace) {
  const [past, setPast] = useState<ImportWorkspace[]>([]);
  const [present, setPresent] = useState(() => clone(initial));
  const [future, setFuture] = useState<ImportWorkspace[]>([]);

  const update = useCallback((next: ImportWorkspace | ((current: ImportWorkspace) => ImportWorkspace)) => {
    setPresent((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      setPast((items) => [...items.slice(-(MAX_HISTORY - 1)), clone(current)]);
      setFuture([]);
      return { ...resolved, updatedAt: new Date().toISOString(), revision: current.revision + 1 };
    });
  }, []);

  const undo = useCallback(() => {
    setPast((items) => {
      const previous = items.at(-1);
      if (!previous) return items;
      setFuture((itemsAfter) => [clone(present), ...itemsAfter]);
      setPresent(clone(previous));
      return items.slice(0, -1);
    });
  }, [present]);

  const redo = useCallback(() => {
    setFuture((items) => {
      const next = items[0];
      if (!next) return items;
      setPast((itemsBefore) => [...itemsBefore.slice(-(MAX_HISTORY - 1)), clone(present)]);
      setPresent(clone(next));
      return items.slice(1);
    });
  }, [present]);

  return { workspace: present, setWorkspace: update, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 };
}

