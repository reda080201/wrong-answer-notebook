import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "src", "styles");

function read(relativePath: string) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

describe("CSS ownership contract", () => {
  it("keeps migrated entry row and toolbar selectors out of legacy styles", () => {
    const legacy = ["legacy/00-app-styles.css", "legacy/07-app-styles.css", "legacy/10-app-styles.css"]
      .map(read)
      .join("\n");
    expect(legacy).not.toMatch(/\.entry-card(?:[\s:{>])/);
    expect(legacy).not.toMatch(/\.detail-toolbar(?:[\s:{>_-])/);
  });

  it("keeps the owning selectors in the current feature layer", () => {
    const foundation = read("ui-foundation.css");
    const consolidation = read("ui-consolidation.css");
    expect(foundation).toMatch(/\.entry-card/);
    expect(consolidation).toMatch(/\.detail-toolbar--problem-sheet/);
  });
});
