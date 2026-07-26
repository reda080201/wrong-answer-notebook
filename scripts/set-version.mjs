import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error("사용법: npm run version:set -- 1.2.3");
const root = process.cwd();
const updateJson = (file, update) => {
  const full = path.join(root, file);
  const value = JSON.parse(fs.readFileSync(full, "utf8"));
  fs.writeFileSync(full, `${JSON.stringify(update(value), null, 2)}\n`);
};
updateJson("package.json", (value) => ({ ...value, version }));
updateJson("package-lock.json", (value) => ({ ...value, version, packages: { ...value.packages, "": { ...value.packages?.[""], version } } }));
const cargo = path.join(root, "src-tauri/Cargo.toml");
fs.writeFileSync(cargo, fs.readFileSync(cargo, "utf8").replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`));
updateJson("src-tauri/tauri.conf.json", (value) => ({ ...value, version }));
const lock = path.join(root, "src-tauri/Cargo.lock");
if (fs.existsSync(lock)) fs.writeFileSync(lock, fs.readFileSync(lock, "utf8").replace(/(name = "wrong-answer-notebook"\r?\nversion = )"[^"]+"/, `$1"${version}"`));

