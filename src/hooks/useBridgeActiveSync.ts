import { useCallback, useEffect, useRef, useState } from "react";
import { syncMcpBridgeActiveContext } from "../api";
import type { McpActiveContext } from "../types";
import type { McpBridgeRuntimeStatus } from "./useMcpBridgeSettings";

export interface BridgeSyncState { active: boolean; syncing: boolean; lastSyncAt: string | null; lastSyncError: string | null; syncedCount: number; }
export interface LegacyBridgeActiveSyncOptions { bridgeEnabled: boolean; bridgeStatus: McpBridgeRuntimeStatus | null; syncEntries?: () => Promise<number>; pollIntervalMs?: number; }

/** Debounced, best-effort UI context sync. It never persists notebook data. */
export function useBridgeActiveSync(options: boolean | LegacyBridgeActiveSyncOptions) {
  const legacy = typeof options === "object" ? options : undefined;
  const enabled = legacy ? legacy.bridgeEnabled && (legacy.bridgeStatus?.status === "listening" || legacy.bridgeStatus?.status === "connected") : Boolean(options);
  const timer = useRef<number | null>(null);
  const last = useRef<string>("");
  const legacySyncEntries = useRef(legacy?.syncEntries);
  legacySyncEntries.current = legacy?.syncEntries;
  const [bridgeSyncState, setBridgeSyncState] = useState<BridgeSyncState>({ active: enabled, syncing: false, lastSyncAt: null, lastSyncError: null, syncedCount: 0 });

  const syncActiveContext = useCallback((context: McpActiveContext) => {
    const key = JSON.stringify(context);
    if (key === last.current) return;
    last.current = key;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (enabled) void syncMcpBridgeActiveContext(context).catch(() => undefined);
    }, 150);
  }, [enabled]);

  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  useEffect(() => { if (!enabled) syncActiveContext({ entryId: null, questionNumber: null }); }, [enabled, syncActiveContext]);
  useEffect(() => { setBridgeSyncState((state) => ({ ...state, active: enabled, syncing: enabled ? state.syncing : false })); }, [enabled]);
  const triggerBridgeSync = useCallback(async () => {
    if (!enabled || !legacySyncEntries.current) return;
    setBridgeSyncState((state) => ({ ...state, syncing: true, lastSyncError: null }));
    try {
      const count = await legacySyncEntries.current();
      setBridgeSyncState((state) => ({ ...state, syncing: false, syncedCount: state.syncedCount + count, lastSyncAt: new Date().toISOString() }));
    } catch (error) {
      setBridgeSyncState((state) => ({ ...state, syncing: false, lastSyncError: error instanceof Error ? error.message : "브릿지 동기화에 실패했습니다." }));
    }
  }, [enabled]);
  useEffect(() => { if (legacySyncEntries.current && enabled) void triggerBridgeSync(); }, [enabled, triggerBridgeSync]);
  return { syncActiveContext, bridgeSyncState, triggerBridgeSync };
}
