export type ReconciliationLoadStatus = "loading" | "ready" | "error";

export interface ReconciliationReadiness {
  graph: ReconciliationLoadStatus;
  entries: ReconciliationLoadStatus;
  pendingDeletions: ReconciliationLoadStatus;
  maintenanceBlocked: boolean;
}

/** Destructive link cleanup is allowed only after every source is known to be usable. */
export function canReconcileKnowledgeGraph({
  graph,
  entries,
  pendingDeletions,
  maintenanceBlocked,
}: ReconciliationReadiness): boolean {
  return !maintenanceBlocked
    && graph === "ready"
    && entries === "ready"
    && pendingDeletions === "ready";
}
