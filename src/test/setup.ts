import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

// jsdom has no layout scrolling; browser acceptance exercises the real behavior.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// File isolation is deliberately disabled for the Windows single-worker suite.
// A leaked fake clock would otherwise stall unrelated UI tests.
afterEach(() => {
  vi.useRealTimers();
});
