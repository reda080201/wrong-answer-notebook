import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("isolated launcher does not reinstall dependencies in CI", async () => {
  const source = await readFile(new URL("./launch-web-isolated.mjs", import.meta.url), "utf8");
  assert.match(source, /if \(!process\.env\.CI\) await synchronizeDependencies\(root\)/);
});
