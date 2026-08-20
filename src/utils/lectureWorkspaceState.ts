export interface LectureWorkspaceState {
  outlineOpen: boolean;
  relatedOpen: boolean;
  scrollTop: number;
  updatedAt: number;
}

const STORAGE_KEY = "wrong-answer-lecture-workspace-state";
const MAX_LECTURES = 100;
let lastUpdatedAt = 0;

function readAll(storage: Pick<Storage, "getItem">): Record<string, LectureWorkspaceState> {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" ? value as Record<string, LectureWorkspaceState> : {};
  } catch {
    return {};
  }
}

export function loadLectureWorkspaceState(entryId: string, storage: Pick<Storage, "getItem"> | undefined = typeof localStorage === "undefined" ? undefined : localStorage): LectureWorkspaceState | undefined {
  if (!storage) return undefined;
  const state = readAll(storage)[entryId];
  return state && typeof state === "object" && Number.isFinite(state.scrollTop)
    ? state
    : undefined;
}

export function saveLectureWorkspaceState(entryId: string, patch: Partial<LectureWorkspaceState>, storage: Pick<Storage, "getItem" | "setItem"> | undefined = typeof localStorage === "undefined" ? undefined : localStorage): void {
  if (!storage || !entryId) return;
  const all = readAll(storage);
  const current = all[entryId] ?? { outlineOpen: true, relatedOpen: true, scrollTop: 0, updatedAt: 0 };
  lastUpdatedAt = Math.max(Date.now(), lastUpdatedAt + 1);
  all[entryId] = { ...current, ...patch, updatedAt: lastUpdatedAt };
  const retained = Object.entries(all)
    .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_LECTURES);
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(retained)));
  } catch {
    // UI restoration is optional; storage failures must not block reading.
  }
}

export const LECTURE_WORKSPACE_STORAGE_KEY = STORAGE_KEY;
