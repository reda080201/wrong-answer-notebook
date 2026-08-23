import { createContext, useContext, type ReactNode } from "react";
import type { WrongAnswerEntry } from "../../../types";
import type { ResolvedEntryQuestion } from "../../../utils/entryQuestions";

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

export interface EntryDetailDataContextValue {
  entry: WrongAnswerEntry;
  allEntries: WrongAnswerEntry[];
  selectedQuestion: ResolvedEntryQuestion | null;
  questions: ResolvedEntryQuestion[];
}

interface EntryDetailContextValue {
  entry: WrongAnswerEntry;
  data?: EntryDetailDataContextValue;
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

export function useEntryDetailDataContext(): EntryDetailDataContextValue {
  const value = useEntryDetailContext();
  if (!value.data) throw new Error("EntryDetail 데이터 영역은 data context 안에서 렌더링되어야 합니다.");
  return value.data;
}
