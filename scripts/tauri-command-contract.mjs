import fs from "node:fs";
import path from "node:path";

const INVOKE_CALL = /\binvoke(?:<[^>]+>)?\s*\(/g;
const LITERAL_INVOKE = /\binvoke(?:<[^>]+>)?\s*\(\s*(["'`])([^"'`]+)\1/g;

export function collectFrontendCommands(sources) {
  const commands = new Set();
  const dynamicCalls = [];
  for (const [filename, source] of sources) {
    const callCount = [...source.matchAll(INVOKE_CALL)].length;
    const matches = [...source.matchAll(LITERAL_INVOKE)];
    matches.forEach((match) => commands.add(match[2]));
    if (callCount !== matches.length) dynamicCalls.push(filename);
  }
  return { commands, dynamicCalls };
}

export function collectRustHandlers(source) {
  const body = source.match(/tauri::generate_handler!\s*\[([\s\S]*?)\]/)?.[1] ?? "";
  return new Set(
    body
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => value.split("::").at(-1)),
  );
}

export function collectAllowedCommands(source) {
  const body = source.match(/commands\.allow\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? "";
  const values = [...body.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
  return { commands: new Set(values), duplicates: [...new Set(values.filter((value, index) => values.indexOf(value) !== index))] };
}

export function collectCapabilityPermissions(source) {
  const parsed = JSON.parse(source);
  return new Set(Array.isArray(parsed.permissions) ? parsed.permissions : []);
}

export function validateRequiredCapabilities(capabilities, required) {
  return required.filter((permission) => !capabilities.has(permission)).sort();
}

export function validateCommandContract({ frontend, handlers, permissions, dynamicCalls = [] }) {
  const missingHandlers = [...frontend].filter((command) => !handlers.has(command)).sort();
  const missingPermissions = [...frontend].filter((command) => !permissions.has(command)).sort();
  const permissionsWithoutHandlers = [...permissions].filter((command) => !handlers.has(command)).sort();
  return { missingHandlers, missingPermissions, permissionsWithoutHandlers, dynamicCalls };
}

export function readTypeScriptSources(root) {
  const result = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (/\.tsx?$/.test(entry.name)) result.push([filename, fs.readFileSync(filename, "utf8")]);
    }
  };
  visit(root);
  return result;
}
