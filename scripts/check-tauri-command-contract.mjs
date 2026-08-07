import fs from "node:fs";
import {
  collectAllowedCommands,
  collectCapabilityPermissions,
  collectFrontendCommands,
  collectRustHandlers,
  readTypeScriptSources,
  validateCommandContract,
  validateRequiredCapabilities,
} from "./tauri-command-contract.mjs";

const REQUIRED_CORE_PERMISSIONS = [
  "core:window:allow-close",
  "core:window:allow-destroy",
];

const frontendResult = collectFrontendCommands(readTypeScriptSources("src"));
const handlers = collectRustHandlers(fs.readFileSync("src-tauri/src/lib.rs", "utf8"));
const permissionResult = collectAllowedCommands(fs.readFileSync("src-tauri/permissions/notebook.toml", "utf8"));
const capabilities = collectCapabilityPermissions(fs.readFileSync("src-tauri/capabilities/default.json", "utf8"));
const result = validateCommandContract({
  frontend: frontendResult.commands,
  handlers,
  permissions: permissionResult.commands,
  dynamicCalls: frontendResult.dynamicCalls,
});

let failed = false;
for (const [label, values] of Object.entries(result)) {
  if (values.length === 0) continue;
  console.error(`${label}: ${values.join(", ")}`);
  failed = true;
}
if (permissionResult.duplicates.length) {
  console.warn(`duplicatePermissions: ${permissionResult.duplicates.join(", ")}`);
}
const missingCapabilities = validateRequiredCapabilities(capabilities, REQUIRED_CORE_PERMISSIONS);
if (missingCapabilities.length) {
  console.error(`missingCapabilities: ${missingCapabilities.join(", ")}`);
  failed = true;
}
if (failed) process.exit(1);
console.log(`Tauri command 계약 검사 통과: frontend ${frontendResult.commands.size}, handlers ${handlers.size}, permissions ${permissionResult.commands.size}`);
