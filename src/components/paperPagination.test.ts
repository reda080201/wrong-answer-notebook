import { describe, expect, it } from "vitest";
import { paginatePaper, PAPER_COLUMN_WIDTH, PAPER_GAP, PAPER_PADDING, PAPER_WIDTH } from "./paperPagination";

const items = Array.from({ length: 6 }, (_, index) => ({ id: String(index + 1), questionNumber: String(index + 1) }));
describe("A4 paper pagination", () => {
  it("uses printable column widths and fills left, right, then the next page", () => {
    expect(PAPER_COLUMN_WIDTH * 2 + PAPER_GAP + PAPER_PADDING * 2).toBe(PAPER_WIDTH);
    const heights = new Map(items.map(item => [item.id, 400]));
    const pages = paginatePaper(items, heights, heights);
    expect(pages[0].columns.map(column => column?.items.map(item => item.id))).toEqual([["1", "2"], ["3", "4"]]);
    expect(pages[1].questionNumbers).toEqual(["5", "6"]);
  });
  it("keeps explicit stimulus groups together and never infers groups from classification", () => {
    const grouped = items.map((item, index) => ({ ...item, groupId: index === 1 || index === 2 ? "passage" : undefined }));
    const heights = new Map(items.map(item => [item.id, 350]));
    const pages = paginatePaper(grouped, heights, heights);
    expect(pages[0].columns[1]?.items.map(item => item.id)).toEqual(["2", "3"]);
    expect(pages.flatMap(page => page.questionNumbers)).toEqual(items.map(item => item.id));
  });
  it("isolates wide groups and expands only oversized pages", () => {
    const grouped = items.slice(0, 3);
    const narrow = new Map([["1", 200], ["2", 1600], ["3", 200]]);
    const wide = new Map([["1", 200], ["2", 800], ["3", 200]]);
    const pages = paginatePaper(grouped, narrow, wide);
    expect(pages[1].fullWidth).toBe(true);
    expect(pages[1].oversized).toBe(false);
    wide.set("2", 1800);
    const oversized = paginatePaper(grouped, narrow, wide);
    expect(oversized[1].oversized).toBe(true);
    expect(oversized[2].questionNumbers).toEqual(["3"]);
  });

  it("rechecks normal-column capacity after moving past the header page", () => {
    const narrow = new Map([["1", 200], ["2", 930]]);
    const wide = new Map(narrow);
    const pages = paginatePaper(items.slice(0, 2), narrow, wide);
    expect(pages).toHaveLength(2);
    expect(pages[1].fullWidth).toBeFalsy();
    expect(pages[1].columns[0]?.items.map(item => item.id)).toEqual(["2"]);
  });

  it("uses a full-width page only when a fresh normal column is too short", () => {
    const group = [{ id: "a", groupId: "shared" }, { id: "b", groupId: "shared" }];
    const narrow = new Map([["a", 600], ["b", 600]]);
    const wide = new Map([["a", 300], ["b", 300]]);
    const pages = paginatePaper(group, narrow, wide);
    expect(pages).toHaveLength(1);
    expect(pages[0].fullWidth).toBe(true);
    expect(pages[0].oversized).toBe(false);
    expect(pages[0].questionNumbers).toEqual(["a", "b"]);
  });

  it("marks a group oversized only when its wide layout also exceeds a fresh page", () => {
    const group = [{ id: "a", groupId: "shared" }, { id: "b", groupId: "shared" }];
    const narrow = new Map([["a", 1200], ["b", 1200]]);
    const wide = new Map([["a", 700], ["b", 700]]);
    const pages = paginatePaper(group, narrow, wide);
    expect(pages[0].fullWidth).toBe(true);
    expect(pages[0].oversized).toBe(true);
  });
});
