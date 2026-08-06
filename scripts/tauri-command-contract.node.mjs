import assert from "node:assert/strict";
import test from "node:test";
import {
  collectAllowedCommands,
  collectCapabilityPermissions,
  collectFrontendCommands,
  collectRustHandlers,
  validateCommandContract,
  validateRequiredCapabilities,
} from "./tauri-command-contract.mjs";

const inspect = ({ frontend, rust, permission }) => {
  const frontendResult = collectFrontendCommands([["fixture.ts", frontend]]);
  return validateCommandContract({
    frontend: frontendResult.commands,
    handlers: collectRustHandlers(rust),
    permissions: collectAllowedCommands(permission).commands,
    dynamicCalls: frontendResult.dynamicCalls,
  });
};

test("fails when a frontend command has a handler but no permission", () => {
  const result = inspect({
    frontend: 'invoke("load_exam_sessions")',
    rust: "tauri::generate_handler![load_exam_sessions]",
    permission: "commands.allow = []",
  });
  assert.deepEqual(result.missingPermissions, ["load_exam_sessions"]);
});

test("fails when a permitted frontend command has no handler", () => {
  const result = inspect({
    frontend: 'invoke("load_exam_sessions")',
    rust: "tauri::generate_handler![]",
    permission: 'commands.allow = ["load_exam_sessions"]',
  });
  assert.deepEqual(result.missingHandlers, ["load_exam_sessions"]);
});

test("passes when frontend, handler, and permission agree", () => {
  const result = inspect({
    frontend: 'invoke("load_exam_sessions")',
    rust: "tauri::generate_handler![load_exam_sessions]",
    permission: 'commands.allow = ["load_exam_sessions"]',
  });
  assert.deepEqual(result, { missingHandlers: [], missingPermissions: [], permissionsWithoutHandlers: [], dynamicCalls: [] });
});

test("fails when the close guard window capabilities are missing", () => {
  const capabilities = collectCapabilityPermissions('{"permissions":["core:default"]}');
  assert.deepEqual(
    validateRequiredCapabilities(capabilities, ["core:window:allow-close", "core:window:allow-destroy"]),
    ["core:window:allow-close", "core:window:allow-destroy"],
  );
});
