import { beforeEach, describe, expect, it, vi } from "vitest";

const { isTauri } = vi.hoisted(() => ({ isTauri: vi.fn(() => false) }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri, invoke: vi.fn() }));

import { getMcpBridgeStatus, MCP_BRIDGE_VERSION } from "./mcpBridge";

describe("browser MCP bridge contract", () => {
  beforeEach(() => { isTauri.mockReturnValue(false); });

  it("uses the same version as the desktop bridge", async () => {
    const status = await getMcpBridgeStatus();
    expect(MCP_BRIDGE_VERSION).toBe("local-bridge-v2");
    expect(status.bridgeVersion).toBe(MCP_BRIDGE_VERSION);
    expect(status.readOnly).toBe(true);
    expect(status.enabled).toBe(false);
  });
});
