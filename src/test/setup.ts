import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

// File isolation is deliberately disabled for the Windows single-worker suite.
// A leaked fake clock would otherwise stall unrelated UI tests.
afterEach(() => {
  vi.useRealTimers();
});
