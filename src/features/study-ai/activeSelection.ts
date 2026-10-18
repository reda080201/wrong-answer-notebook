import { useSyncExternalStore } from "react";
interface Selection {
    entryId: string;
    questionNumber?: string;
    selectedNumbers: string[];
}
let selection: Selection | null = null;
const listeners = new Set<() => void>();
export function publishStudySelection(next: Selection | null) { selection = next; listeners.forEach(listener => listener()); }
export function useStudySelection() { return useSyncExternalStore(callback => { listeners.add(callback); return () => { listeners.delete(callback); }; }, () => selection, () => null); }
