import type { NormalizedCrop } from "../models/entry";

/** Crop coordinates are normalized source-image coordinates and are never clamped. */
export function isValidNormalizedCrop(value: unknown): value is NormalizedCrop {
  if (!value || typeof value !== "object") return false;
  const crop = value as Record<string, unknown>;
  const parts = [crop.x, crop.y, crop.width, crop.height];
  if (!parts.every((part) => typeof part === "number" && Number.isFinite(part))) return false;
  const { x, y, width, height } = crop as { x: number; y: number; width: number; height: number };
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 && width > 0 && width <= 1 && height > 0 && height <= 1 && x + width <= 1 && y + height <= 1;
}

export function cropValidationMessage(label: string): string {
  return `${label}의 crop 좌표가 0~1 범위를 벗어났습니다. 자동 보정하지 않고 검수가 필요합니다.`;
}
