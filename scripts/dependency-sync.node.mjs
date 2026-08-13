import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  INSTALL_STATE_FILE,
  REQUIRED_FILES,
  calculateDependencyFingerprint,
  inspectDependencyState,
  synchronizeDependencies,
  writeInstallState,
} from "./dependency-sync.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "dependency-sync-"));
  await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies: { pretendard: "^1.3.9" } }));
  await writeFile(path.join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3 }));
  return root;
}

async function installRequiredFiles(root) {
  for (const filename of REQUIRED_FILES) {
    await mkdir(path.dirname(path.join(root, filename)), { recursive: true });
    await writeFile(path.join(root, filename), "fixture");
  }
}

async function stamp(root) {
  const inspection = await inspectDependencyState(root);
  await writeInstallState(root, inspection.expected);
}

test("fresh clone runs npm ci, verifies, and writes the install stamp", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = [];
  const runner = async (_root, args) => {
    calls.push(args.join(" "));
    if (args[0] === "ci") await installRequiredFiles(root);
  };
  const result = await synchronizeDependencies(root, runner);
  assert.equal(result.installed, true);
  assert.deepEqual(calls, ["ci", "ls --depth=0"]);
  assert.equal(JSON.parse(await readFile(path.join(root, "node_modules", INSTALL_STATE_FILE))).fingerprint, await calculateDependencyFingerprint(root));
});

test("matching lockfile and complete dependency tree skip npm ci", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await installRequiredFiles(root);
  await stamp(root);
  const calls = [];
  const result = await synchronizeDependencies(root, async (_root, args) => calls.push(args.join(" ")));
  assert.equal(result.installed, false);
  assert.deepEqual(calls, ["ls --depth=0"]);
});

test("lockfile changes and missing Pretendard files trigger npm ci", async (t) => {
  for (const mutate of [
    async (root) => writeFile(path.join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, changed: true })),
    async (root) => rm(path.join(root, REQUIRED_FILES[1])),
  ]) {
    const root = await fixture();
    t.after(() => rm(root, { recursive: true, force: true }));
    await installRequiredFiles(root);
    await stamp(root);
    await mutate(root);
    const calls = [];
    await synchronizeDependencies(root, async (_root, args) => {
      calls.push(args.join(" "));
      if (args[0] === "ci") await installRequiredFiles(root);
    });
    assert.ok(calls.includes("ci"));
  }
});

test("damaged stamp and npm ls failure trigger repair", async (t) => {
  for (const damageStamp of [true, false]) {
    const root = await fixture();
    t.after(() => rm(root, { recursive: true, force: true }));
    await installRequiredFiles(root);
    await stamp(root);
    if (damageStamp) await writeFile(path.join(root, "node_modules", INSTALL_STATE_FILE), "not json");
    let firstList = !damageStamp;
    const calls = [];
    await synchronizeDependencies(root, async (_root, args) => {
      calls.push(args.join(" "));
      if (args[0] === "ls" && firstList) {
        firstList = false;
        throw new Error("invalid dependency tree");
      }
    });
    assert.ok(calls.includes("ci"));
  }
});

test("npm ci failure is propagated and no success stamp is written", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(synchronizeDependencies(root, async (_root, args) => {
    if (args[0] === "ci") throw new Error("offline");
  }), /offline/);
  await assert.rejects(readFile(path.join(root, "node_modules", INSTALL_STATE_FILE)));
});
