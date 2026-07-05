import type { SheetGroup, WrongAnswerEntry } from "../types";
import { getQuestionCount } from "./questionMeta";

export type SheetGroupListItem =
  | { kind: "single"; entry: WrongAnswerEntry }
  | {
      kind: "group";
      groupId: string;
      groupTitle: string;
      entries: WrongAnswerEntry[];
      totalQuestionCount: number;
    };

function cleanText(value: unknown, limit = 120): string {
  return `${value ?? ""}`.trim().slice(0, limit);
}

export function normalizeSheetGroup(raw: unknown): SheetGroup | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Partial<SheetGroup>;
  const groupTitle = cleanText(value.groupTitle);
  const partTitle = cleanText(value.partTitle);
  if (!groupTitle || !partTitle) return undefined;
  const groupId = cleanText(value.groupId, 160) || slugSheetGroupTitle(groupTitle);
  const partOrder = Number(value.partOrder);
  return {
    groupId,
    groupTitle,
    partTitle,
    partOrder: Number.isFinite(partOrder) ? partOrder : 1,
    questionRange: cleanText(value.questionRange) || undefined,
  };
}

export function slugSheetGroupTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "sheet-group";
}

export function makeSheetGroupId(title: string): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${slugSheetGroupTitle(title)}-${suffix}`;
}

export function resolveSheetGroupId(
  title: string,
  entries: WrongAnswerEntry[],
): string {
  const normalizedTitle = title.trim().toLowerCase();
  const found = entries.find(
    (entry) =>
      entry.entryKind === "problem_sheet" &&
      entry.sheetGroup?.groupTitle.trim().toLowerCase() === normalizedTitle,
  );
  return found?.sheetGroup?.groupId ?? makeSheetGroupId(title);
}

export function buildSheetGroups(entries: WrongAnswerEntry[]): SheetGroupListItem[] {
  const groups = new Map<string, SheetGroupListItem & { kind: "group" }>();
  const items: SheetGroupListItem[] = [];

  for (const entry of entries) {
    if (entry.entryKind !== "problem_sheet" || !entry.sheetGroup) {
      items.push({ kind: "single", entry });
      continue;
    }

    const key = entry.sheetGroup.groupId || entry.sheetGroup.groupTitle;
    const current =
      groups.get(key) ??
      {
        kind: "group" as const,
        groupId: key,
        groupTitle: entry.sheetGroup.groupTitle,
        entries: [],
        totalQuestionCount: 0,
      };
    current.entries.push(entry);
    current.totalQuestionCount += getQuestionCount(entry);
    groups.set(key, current);
  }

  for (const group of groups.values()) {
    group.entries.sort(
      (a, b) =>
        (a.sheetGroup?.partOrder ?? 0) - (b.sheetGroup?.partOrder ?? 0) ||
        a.updatedAt.localeCompare(b.updatedAt),
    );
    items.push(group);
  }

  return items.sort((a, b) => {
    const aTitle = a.kind === "group" ? a.groupTitle : a.entry.title;
    const bTitle = b.kind === "group" ? b.groupTitle : b.entry.title;
    return aTitle.localeCompare(bTitle, "ko");
  });
}
