import { describe, expect, it } from "vitest";
import foundation from "./ui-foundation.css?raw";
import consolidation from "./ui-consolidation.css?raw";
import legacy00 from "./legacy/00-app-styles.css?raw";
import legacy07 from "./legacy/07-app-styles.css?raw";
import legacy10 from "./legacy/10-app-styles.css?raw";

describe("CSS ownership contract", () => {
  it("keeps migrated entry row and toolbar selectors out of legacy styles", () => {
    const legacy = [legacy00, legacy07, legacy10].join("\n");
    expect(legacy).not.toMatch(/\.entry-card(?:[\s:{>])/);
    expect(legacy).not.toMatch(/\.detail-toolbar(?:[\s:{>_-])/);
  });

  it("keeps the owning selectors in the current feature layer", () => {
    expect(foundation).toMatch(/\.entry-card/);
    expect(consolidation).toMatch(/\.detail-toolbar--problem-sheet/);
  });
});
