import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, loadGptSolutionRoundtripDrafts, saveGptSolutionRoundtripDrafts } from "../api";
import type { GptSolutionRoundtripDraft } from "../features/gpt-solution-roundtrip/model";
import { useSerialTaskQueue } from "./useSerialTaskQueue";

export interface GptSolutionRoundtripDraftStore {
  ready: boolean;
  loading: boolean;
  loadError: string | null;
  getDraft(id: string): GptSolutionRoundtripDraft | undefined;
  upsertDraft(draft: GptSolutionRoundtripDraft): Promise<void>;
  updateDraft(id: string, update: (draft: GptSolutionRoundtripDraft) => GptSolutionRoundtripDraft): Promise<void>;
  removeDraft(id: string): Promise<void>;
  reload(): Promise<void>;
  flush(): Promise<void>;
  setMaintenanceBlocked(blocked: boolean): void;
}

export function useGptSolutionRoundtripDrafts(): GptSolutionRoundtripDraftStore {
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const draftsRef = useRef<GptSolutionRoundtripDraft[]>([]);
  const loadedRef = useRef(false);
  const reloadingRef = useRef(false);
  const maintenanceBlockedRef = useRef(false);
  const loadRequestRef = useRef(0);
  const mutationRevisionRef = useRef(0);
  const lastOperationRef = useRef<Promise<unknown>>(Promise.resolve());
  const { enqueue, drain } = useSerialTaskQueue();

  const reload = useCallback(async () => {
    if (reloadingRef.current) return;
    reloadingRef.current = true;
    const request = ++loadRequestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      await drain();
      const revision = mutationRevisionRef.current;
      loadedRef.current = false;
      setReady(false);
      const drafts = await loadGptSolutionRoundtripDrafts();
      if (request !== loadRequestRef.current || revision !== mutationRevisionRef.current) return;
      draftsRef.current = drafts;
      loadedRef.current = true;
      setReady(true);
    } catch (error) {
      if (request === loadRequestRef.current) {
        loadedRef.current = false;
        setReady(false);
        setLoadError(errorMessage(error, "GPT 해설 초안을 불러오지 못했습니다."));
      }
    } finally {
      if (request === loadRequestRef.current) {
        reloadingRef.current = false;
        setLoading(false);
      }
    }
  }, [drain]);

  useEffect(() => { void reload(); }, [reload]);

  const mutate = useCallback((recipe: (current: GptSolutionRoundtripDraft[]) => GptSolutionRoundtripDraft[]) => {
    if (maintenanceBlockedRef.current) {
      return Promise.reject(new Error("백업 또는 복원이 진행 중입니다. 완료된 뒤 다시 시도해 주세요."));
    }
    if (reloadingRef.current) {
      return Promise.reject(new Error("GPT 해설 초안을 새로 불러오는 중입니다. 완료된 뒤 다시 시도해 주세요."));
    }
    if (!loadedRef.current) {
      return Promise.reject(new Error(loadError ?? "GPT 해설 초안을 불러오는 중입니다. 잠시 후 다시 시도해 주세요."));
    }
    mutationRevisionRef.current += 1;
    const operation = enqueue(async () => {
      const next = recipe(draftsRef.current);
      await saveGptSolutionRoundtripDrafts(next);
      draftsRef.current = next;
    });
    lastOperationRef.current = operation;
    return operation;
  }, [enqueue, loadError]);

  const upsertDraft = useCallback((draft: GptSolutionRoundtripDraft) => mutate((current) => [
    ...current.filter((item) => item.id !== draft.id),
    draft,
  ]), [mutate]);
  const updateDraft = useCallback((id: string, update: (draft: GptSolutionRoundtripDraft) => GptSolutionRoundtripDraft) => mutate((current) => {
    let found = false;
    const next = current.map((draft) => {
      if (draft.id !== id) return draft;
      found = true;
      return update(draft);
    });
    if (!found) throw new Error("GPT 해설 초안을 찾을 수 없습니다.");
    return next;
  }), [mutate]);
  const removeDraft = useCallback((id: string) => mutate((current) => {
    if (!current.some((draft) => draft.id === id)) throw new Error("GPT 해설 초안을 찾을 수 없습니다.");
    return current.filter((draft) => draft.id !== id);
  }), [mutate]);
  const getDraft = useCallback((id: string) => draftsRef.current.find((draft) => draft.id === id), []);
  const flush = useCallback(async () => { await lastOperationRef.current; }, []);
  const setMaintenanceBlocked = useCallback((blocked: boolean) => { maintenanceBlockedRef.current = blocked; }, []);

  return {
    ready,
    loading,
    loadError,
    getDraft,
    upsertDraft,
    updateDraft,
    removeDraft,
    reload,
    flush,
    setMaintenanceBlocked,
  };
}
