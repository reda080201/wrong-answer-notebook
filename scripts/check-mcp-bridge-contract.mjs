import fs from "node:fs";

const fixture = JSON.parse(fs.readFileSync("tests/fixtures/mcp-bridge-contract.json", "utf8"));
const frontend = fs.readFileSync("src/services/api/mcpBridge.ts", "utf8");
const rust = fs.readFileSync("src-tauri/src/mcp_bridge_contract.rs", "utf8");
const frontendVersion = frontend.match(/MCP_BRIDGE_VERSION\s*=\s*["']([^"']+)["']/)?.[1];
const rustVersion = rust.match(/MCP_BRIDGE_VERSION[^=]*=\s*["']([^"']+)["']/)?.[1];
const versions = { fixture: fixture.version, frontend: frontendVersion, rust: rustVersion };

if (!Object.values(versions).every((version) => typeof version === "string" && version === fixture.version)) {
  console.error("MCP 브리지 계약 버전이 일치하지 않습니다:", versions);
  process.exit(1);
}

console.log(`MCP 브리지 계약 버전 검사 통과: ${fixture.version}`);
