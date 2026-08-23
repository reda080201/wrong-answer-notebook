import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src", "styles");
const read = (relativePath) => readFile(resolve(root, relativePath), "utf8");

test("migrated entry and toolbar selectors stay out of legacy CSS", async () => {
  const legacy = (await Promise.all([
    read("legacy/00-app-styles.css"),
    read("legacy/07-app-styles.css"),
    read("legacy/10-app-styles.css"),
  ])).join("\n");
  assert.doesNotMatch(legacy, /\.entry-card(?:[\s:{>])/);
  assert.doesNotMatch(legacy, /\.detail-toolbar(?:[\s:{>_-])/);
});

test("current feature layers own the migrated selectors", async () => {
  const foundation = await read("ui-foundation.css");
  const consolidation = await read("ui-consolidation.css");
  assert.match(foundation, /\.entry-card/);
  assert.match(consolidation, /\.detail-toolbar--problem-sheet/);
});

test("shell geometry has one owner and the documented breakpoint contract", async () => {
  const foundation = await read("ui-foundation.css");
  const legacy = (await Promise.all([
    read("legacy/00-app-styles.css"),
    read("legacy/03-app-styles.css"),
    read("legacy/07-app-styles.css"),
    read("legacy/10-app-styles.css"),
  ])).join("\n");
  assert.equal((foundation.match(/\.app-sidebar\s*\{/g) ?? []).length, 1);
  assert.doesNotMatch(legacy, /\.app-sidebar\s*\{/);
  assert.doesNotMatch(foundation, /@media\s*\([^)]*(?:960|820|760|720|680)px/);
});
