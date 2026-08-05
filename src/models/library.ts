export interface LibraryFolder {
  id: string;
  name: string;
  parentId?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeLibraryFolder(value: unknown): LibraryFolder | null {
  if (!value || typeof value !== "object") return null;
  const folder = value as Partial<LibraryFolder>;
  if (
    !isNonEmptyString(folder.id) ||
    !isNonEmptyString(folder.name) ||
    !Number.isFinite(folder.sortOrder) ||
    !isNonEmptyString(folder.createdAt) ||
    !isNonEmptyString(folder.updatedAt)
  ) {
    return null;
  }
  const sortOrder = folder.sortOrder as number;

  if (isNonEmptyString(folder.parentId) && folder.parentId.trim() === folder.id.trim()) {
    return null;
  }

  const parentId = isNonEmptyString(folder.parentId) ? folder.parentId.trim() : undefined;

  return {
    id: folder.id.trim(),
    name: folder.name.trim(),
    parentId,
    sortOrder,
    createdAt: folder.createdAt.trim(),
    updatedAt: folder.updatedAt.trim(),
  };
}

export function isLibraryFolderArray(value: unknown): value is LibraryFolder[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every((item) => {
    const folder = normalizeLibraryFolder(item);
    if (!folder || ids.has(folder.id)) return false;
    ids.add(folder.id);
    return true;
  });
}
