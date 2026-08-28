import { describe, expect, it } from "vitest";
import { isValidNormalizedCrop } from "./normalizedCrop";

describe("normalized crop contract", () => {
  it.each([
    { x: 0, y: 0, width: 1, height: 1 },
    { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
    { x: 0.99, y: 0.99, width: 0.01, height: 0.01 },
  ])("accepts valid normalized crop %#", (crop) => {
    expect(isValidNormalizedCrop(crop)).toBe(true);
  });

  it.each([
    { x: -0.1, y: 0, width: 0.5, height: 0.5 },
    { x: 0, y: 0, width: 0, height: 0.5 },
    { x: 0.8, y: 0, width: 0.3, height: 0.5 },
    { x: 0, y: 0.8, width: 0.5, height: 0.3 },
    { x: 0, y: 0, width: 1.1, height: 0.5 },
  ])("rejects invalid crop %# without clamping", (crop) => {
    expect(isValidNormalizedCrop(crop)).toBe(false);
  });
});
