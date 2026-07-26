import { describe, expect, it } from "vitest";
import {
  buildChatGptPrompt,
  isRecentClientConnection,
  normalizeRemoteMcpBaseUrl,
} from "./chatGptConnection";

describe("chatGptConnection", () => {
  it("normalizes a remote base URL and derives pairing and MCP endpoints", () => {
    expect(normalizeRemoteMcpBaseUrl("https://tunnel.example/mcp/")).toEqual({
      baseUrl: "https://tunnel.example",
      pairingUrl: "https://tunnel.example/pair",
      mcpUrl: "https://tunnel.example/mcp",
    });
  });

  it.each([
    "http://tunnel.example",
    "https://localhost:43129",
    "https://tunnel.example/mcp?token=x",
    "https://user:pass@tunnel.example",
  ])("rejects unsafe remote URL %s", (url) => {
    expect(() => normalizeRemoteMcpBaseUrl(url)).toThrow();
  });

  it("keeps answers forbidden in a pre-submit prompt", () => {
    const prompt = buildChatGptPrompt("pre-submit", "힌트만 줘", { displayName: "오답노트" });
    expect(prompt).toContain("정답과 공식 해설은 말하지 마");
    expect(prompt).toContain("@오답노트");
  });

  it("uses review wording after submission", () => {
    const prompt = buildChatGptPrompt("submitted", "내가 왜 틀렸는지 분석해 줘", { displayName: "오답노트" });
    expect(prompt).toContain("정답, 공식 해설");
  });

  it("marks only recent client activity as recent", () => {
    const now = Date.parse("2026-07-23T00:00:00.000Z");
    expect(isRecentClientConnection("2026-07-22T23:55:00.000Z", now)).toBe(true);
    expect(isRecentClientConnection("2026-07-22T23:00:00.000Z", now)).toBe(false);
  });
});

