import { test, expect } from "@playwright/test";

test("real click, Enter and Space activate wiki controls once without parent actions or submit", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 750 });
  const shell = await page.request.get("/");
  const html = (await shell.text()).replace("/src/main.tsx", "/e2e/fixtures/wikiControlsHarness.tsx");
  await page.route("**/wiki-control-check", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("/wiki-control-check");
  let calls = 0;
  for (const label of ["대수", "기하"]) {
    const control = page.getByRole("button", { name: label, exact: true });
    await expect(control).toHaveAttribute("type", "button");
    await control.click(); await expect(page.getByLabel("activation counts")).toHaveText(`${++calls}/0/0`);
    await control.press("Enter"); await expect(page.getByLabel("activation counts")).toHaveText(`${++calls}/0/0`);
    await control.press("Space"); await expect(page.getByLabel("activation counts")).toHaveText(`${++calls}/0/0`);
    await expect(control).toBeFocused();
  }
  await expect(page.locator("mark button")).toHaveText("기하");
  await expect(page.locator(".katex")).toBeVisible();
});
