import { useMemo, useSyncExternalStore } from "react";

type Snapshot = Record<string, { url?: string; error?: string }>;

function createObjectUrlResource<T extends { key: string; file: File }>(items: T[]) {
  let snapshot: Snapshot = {};
  let active = false;
  let urls: string[] = [];
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!active) {
        active = true;
        const nextSnapshot: Snapshot = {};
        for (const item of items) {
          try {
            const url = URL.createObjectURL(item.file);
            urls.push(url);
            nextSnapshot[item.key] = { url };
          } catch {
            nextSnapshot[item.key] = { error: "이 페이지의 미리보기를 불러오지 못했습니다." };
          }
        }
        snapshot = nextSnapshot;
        listeners.forEach((notify) => notify());
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && active) {
          active = false;
          urls.forEach((url) => URL.revokeObjectURL(url));
          urls = [];
          snapshot = {};
        }
      };
    },
  };
}

/** Owns object URLs for the lifetime of subscribers; File access stays in the subscription lifecycle. */
export function useObjectUrlResources<T extends { key: string; file: File }>(items: T[]): Snapshot {
  const resource = useMemo(() => createObjectUrlResource(items), [items]);
  return useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);
}
