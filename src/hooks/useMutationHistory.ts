import { useCallback, useEffect, useRef, useState } from "react";

export interface MutationCommand {
  label: string;
  undo(): Promise<void> | void;
  redo(): Promise<void> | void;
}

function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)));
}

/** In-memory history intentionally excludes imports, image lifecycle, and exam submission. */
export function useMutationHistory(limit = 50) {
  const undoStack = useRef<MutationCommand[]>([]);
  const redoStack = useRef<MutationCommand[]>([]);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const [state, setState] = useState({ canUndo: false, canRedo: false });
  const sync = useCallback(() => {
    if (mountedRef.current) setState({ canUndo: undoStack.current.length > 0, canRedo: redoStack.current.length > 0 });
  }, []);
  const execute = useCallback(async (command: MutationCommand) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    try {
      await command.redo();
      undoStack.current = [...undoStack.current, command].slice(-limit);
      redoStack.current = [];
      sync();
      return true;
    } finally { busyRef.current = false; }
  }, [limit, sync]);
  const undo = useCallback(async () => {
    if (busyRef.current) return false;
    const command = undoStack.current.at(-1);
    if (!command) return false;
    busyRef.current = true;
    try {
      await command.undo();
      undoStack.current = undoStack.current.slice(0, -1);
      redoStack.current = [...redoStack.current, command].slice(-limit);
      sync();
      return true;
    } finally { busyRef.current = false; }
  }, [limit, sync]);
  const redo = useCallback(async () => {
    if (busyRef.current) return false;
    const command = redoStack.current.at(-1);
    if (!command) return false;
    busyRef.current = true;
    try {
      await command.redo();
      redoStack.current = redoStack.current.slice(0, -1);
      undoStack.current = [...undoStack.current, command].slice(-limit);
      sync();
      return true;
    } finally { busyRef.current = false; }
  }, [limit, sync]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || isEditableTarget(event.target)) return;
      if (event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      void (event.shiftKey ? redo() : undo());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);
  useEffect(() => () => { mountedRef.current = false; }, []);
  return { ...state, execute, undo, redo };
}
