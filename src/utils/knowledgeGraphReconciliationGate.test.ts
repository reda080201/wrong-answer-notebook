import { describe, expect, it } from "vitest";
import { canReconcileKnowledgeGraph } from "./knowledgeGraphReconciliationGate";

describe("knowledge graph reconciliation readiness", () => {
  it.each([
    ["graph pending", { graph: "loading", entries: "ready", pendingDeletions: "ready", maintenanceBlocked: false }],
    ["entries pending", { graph: "ready", entries: "loading", pendingDeletions: "ready", maintenanceBlocked: false }],
    ["pending deletions pending", { graph: "ready", entries: "ready", pendingDeletions: "loading", maintenanceBlocked: false }],
    ["entries failed", { graph: "ready", entries: "error", pendingDeletions: "ready", maintenanceBlocked: false }],
    ["pending deletions failed", { graph: "ready", entries: "ready", pendingDeletions: "error", maintenanceBlocked: false }],
    ["maintenance", { graph: "ready", entries: "ready", pendingDeletions: "ready", maintenanceBlocked: true }],
  ])("blocks reconciliation while %s", (_label, readiness) => {
    expect(canReconcileKnowledgeGraph(readiness as never)).toBe(false);
  });

  it("allows reconciliation after all stores successfully load, including empty entries", () => {
    expect(canReconcileKnowledgeGraph({ graph: "ready", entries: "ready", pendingDeletions: "ready", maintenanceBlocked: false })).toBe(true);
  });
});
