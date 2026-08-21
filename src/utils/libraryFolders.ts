import type { LibraryFolder } from "../types";

/** Returns a folder and every reachable child without assuming stored parents are acyclic. */
export function getFolderDescendantIds(folders: LibraryFolder[], rootId: string): Set<string> {
  const descendants = new Set<string>([rootId]);
  const childrenByParent = new Map<string, string[]>();

  for (const folder of folders) {
    if (!folder.parentId) continue;
    const children = childrenByParent.get(folder.parentId) ?? [];
    children.push(folder.id);
    childrenByParent.set(folder.parentId, children);
  }

  const pending = [rootId];
  while (pending.length > 0) {
    const parentId = pending.pop();
    if (!parentId) continue;
    for (const childId of childrenByParent.get(parentId) ?? []) {
      if (descendants.has(childId)) continue;
      descendants.add(childId);
      pending.push(childId);
    }
  }

  return descendants;
}
