import { createContext, useContext, type ReactNode } from "react";
import type { WrongAnswerEntry } from "../../../types";

export interface EntryDetailActionGroup {
  onEdit(): void;
  onDelete(): void;
  onToggleMastered(): void | Promise<void>;
  onToggleDifficult(): void | Promise<void>;
}

export interface EntryDetailWorkspaceState {
  detailViewMode: string;
  focusMode: string;
  selectionMode: boolean;
}

interface EntryDetailContextValue {
  entry: WrongAnswerEntry;
  actions: EntryDetailActionGroup;
  workspace: EntryDetailWorkspaceState;
}

const EntryDetailContext = createContext<EntryDetailContextValue | null>(null);

export function EntryDetailProvider({ value, children }: { value: EntryDetailContextValue; children: ReactNode }) {
  return <EntryDetailContext.Provider value={value}>{children}</EntryDetailContext.Provider>;
}

export function useEntryDetailContext(): EntryDetailContextValue {
  const value = useContext(EntryDetailContext);
  if (!value) throw new Error("EntryDetail 하위 영역은 EntryDetailProvider 안에서 렌더링되어야 합니다.");
  return value;
}
