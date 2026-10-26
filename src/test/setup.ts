import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

// jsdom has no layout scrolling; browser acceptance exercises the real behavior.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// Reset fake timers after each test so leaked fake clocks do not stall later tests.
afterEach(() => {
  vi.useRealTimers();
});
