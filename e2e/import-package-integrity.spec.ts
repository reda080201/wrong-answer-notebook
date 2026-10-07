import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { seedBrowserStorage } from "./fixtures/syntheticLifecycle";
import { validPngBytes } from "../src/test/fixtures/validPng";

for (const variant of ["valid", "truncated", "wrong-case", "missing"] as const) {
  test(`PNG package uses real browser decoding and exact references: ${variant}`, async ({ page }) => {
    await seedBrowserStorage(page, []);
    await page.goto("/");
    await page.getByRole("button", { name: "시험지함", exact: true }).click();
    await page.getByRole("button", { name: "+ 시험지 가져오기", exact: true }).click();
    const zip = new JSZip();
    zip.file("import.json", JSON.stringify({ entryKind: "problem_sheet", title: "이미지 검증", subject: "수학", question: "1. 원본 이미지 문항", sourcePageImages: ["images/Page.png"] }));
    if (variant !== "missing") zip.file(variant === "wrong-case" ? "images/page.png" : "images/Page.png", variant === "truncated" ? validPngBytes.slice(0, 8) : validPngBytes);
    await page.getByLabel("올인원 가져오기").setInputFiles({ name: "package.zip", mimeType: "application/zip", buffer: await zip.generateAsync({ type: "nodebuffer" }) });
    if (variant === "valid") {
      await expect(page.getByText(/올인원 가져오기 완료: 1개 항목/)).toBeVisible();
      await page.getByRole("button", { name: "바로 저장", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "시험지 가져오기" })).toBeHidden();
      const entries = await page.evaluate(() => JSON.parse(localStorage.getItem("wrong-answer-entries")!).entries);
      expect(entries).toHaveLength(1);
      expect(entries[0].sourcePageImages).toHaveLength(1);
    } else {
      await expect(page.getByRole("dialog", { name: "시험지 가져오기" }).getByRole("alert")).toContainText(variant === "truncated" ? "디코딩할 수 없습니다" : "일치하지 않습니다");
      await expect(page.getByRole("button", { name: "수정 후 저장", exact: true })).toBeDisabled();
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("wrong-answer-entries")!).entries)).toHaveLength(0);
    }
  });
}
