import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const conf = JSON.parse(fs.readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"));
const cargo = fs.readFileSync(path.join(root, "src-tauri/Cargo.toml"), "utf8").match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const versions = [pkg.version, cargo, conf.version];
if (!versions.every((value) => /^\d+\.\d+\.\d+$/.test(value)) || new Set(versions).size !== 1) throw new Error(`버전이 일치하지 않습니다: ${versions.join(", ")}`);
console.log(`version ${versions[0]} is consistent`);

