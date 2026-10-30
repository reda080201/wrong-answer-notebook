import type { SourceRole } from "./assessmentFlow";
import type { PageRoleSelection, PageRoleSource } from "./MixedPageRoleDialog";
export type PageRoleReviewer = (sources: PageRoleSource[], signal: AbortSignal) => Promise<PageRoleSelection[]>;
export function resolvePageRoles(sources: PageRoleSource[], roles: SourceRole[], selected: PageRoleSelection[] = []): PageRoleSelection[] {
  const seen = new Set<string>();
  for (const row of selected) {
    const index = sources.findIndex(source => source.sourceKey === row.sourceKey);
    const key = JSON.stringify([row.sourceKey,row.page]);
    if (index < 0 || roles[index] !== "mixed" || !Number.isInteger(row.page) || row.page < 1 || row.page > sources[index].pages.length || seen.has(key) || !["problem","answer","mixed","exclude"].includes(row.role)) throw new Error("페이지 역할의 원본·범위를 확인하세요.");
    seen.add(key);
  }
  return sources.flatMap((source,index) => source.pages.map((_,ordinal) => {
    const page = ordinal + 1;
    const choice = selected.find(row => row.sourceKey === source.sourceKey && row.page === page);
    if (roles[index] === "mixed" && !choice) throw new Error("혼합 자료의 모든 페이지 역할을 확인하세요.");
    return choice ?? { sourceKey: source.sourceKey, page, role: roles[index] ?? "problem" };
  }));
}
