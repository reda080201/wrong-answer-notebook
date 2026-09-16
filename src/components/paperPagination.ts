export type PaperNavigationMode = "vertical-pages" | "horizontal-pages";
export interface PaperPageItem { id: string; questionNumber?: string; groupId?: string }
export interface PaperColumn { items: PaperPageItem[]; usedHeight: number }
export interface PaperPageModel { id: string; columns: [PaperColumn, PaperColumn?]; questionNumbers: string[]; oversized?: boolean; fullWidth?: boolean }
export const PAPER_WIDTH = 794;
export const PAPER_HEIGHT = 1123;
export const PAPER_PADDING = 44;
export const PAPER_GAP = 28;
export const PAPER_ITEM_GAP = 26;
export const PAPER_COLUMN_WIDTH = (PAPER_WIDTH - 2 * PAPER_PADDING - PAPER_GAP) / 2;

export function paginatePaper(items: PaperPageItem[], narrow: Map<string, number>, wide: Map<string, number>, columnCount: 1 | 2 = 2, headerHeight = 108): PaperPageModel[] {
  const pages: PaperPageModel[] = [];
  const empty = (): PaperPageModel => ({ id: `paper-${pages.length + 1}`, columns: columnCount === 2 ? [{ items: [], usedHeight: 0 }, { items: [], usedHeight: 0 }] : [{ items: [], usedHeight: 0 }], questionNumbers: [] });
  let page = empty();
  let columnIndex = 0;
  const capacity = (isFirstPage: boolean) => PAPER_HEIGHT - PAPER_PADDING * 2 - (isFirstPage ? headerHeight : 0);
  const push = () => { if (page.questionNumbers.length || page.columns.some(column => column?.items.length)) pages.push(page); page = empty(); columnIndex = 0; };
  const groups: PaperPageItem[][] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (item.groupId && last?.[0].groupId === item.groupId) last.push(item);
    else groups.push([item]);
  }
  for (const group of groups) {
    const height = group.reduce((sum, item) => sum + (narrow.get(item.id) ?? 200) + PAPER_ITEM_GAP, 0);
    const currentCapacity = capacity(pages.length === 0);
    let column = page.columns[columnIndex]!;
    if (column.usedHeight + height > currentCapacity) {
      const nextColumnIndex = columnIndex + 1;
      const nextColumn = page.columns[nextColumnIndex];
      if (nextColumn && nextColumn.usedHeight + height <= currentCapacity) {
        columnIndex = nextColumnIndex;
        column = nextColumn;
      } else {
        // Commit a non-empty page, then recalculate capacity without the first-page header.
        if (page.questionNumbers.length || page.columns.some(candidate => candidate?.items.length)) push();
        const freshCapacity = capacity(pages.length === 0);
        column = page.columns[0]!;
        columnIndex = 0;
        if (height > freshCapacity) {
          const fullHeight = group.reduce((sum, item) => sum + (wide.get(item.id) ?? narrow.get(item.id) ?? 200) + PAPER_ITEM_GAP, 0);
          page.fullWidth = true;
          page.oversized = fullHeight > freshCapacity;
          page.columns = [{ items: group, usedHeight: fullHeight }];
          page.questionNumbers = group.map(item => item.questionNumber ?? item.id);
          push();
          continue;
        }
      }
    }
    column.items.push(...group);
    column.usedHeight += height;
    page.questionNumbers.push(...group.map(item => item.questionNumber ?? item.id));
  }
  push();
  return pages.length ? pages : [empty()];
}
