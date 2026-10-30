import { expect, test } from "@playwright/test";

const key = "wrong-answer-ai-study-v1";
test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("wrong-answer-theme", "light"));
});
test("AI browser guidance retains input across panel and general settings", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 750 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const launcher = page.getByRole("button", { name: "AI 학습 대화 열기" });
    await launcher.click();
    const panel = page.getByRole("dialog", { name: "AI 학습 대화" });
    const message = panel.getByLabel("메시지");
    await expect(panel.getByRole("status")).toContainText("Windows 설치 앱");
    await expect(panel.getByRole("button", { name: "AI 연결 설정", exact: true })).toHaveCount(0);
    await message.fill("전송하지 않은 입력");
    await expect(panel.getByRole("button", { name: "전송", exact: true })).toBeDisabled();
    await panel.getByRole("button", { name: "AI 대화 닫기" }).click();
    await expect(panel).toBeHidden();

    await page.getByRole("button", { name: "설정", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "설정", exact: true });
    await expect(settings).toBeVisible();
    await expect(launcher).toBeHidden();
    await settings.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(settings).toBeHidden();
    await expect(launcher).toBeVisible();
    await launcher.click();
    await expect(panel).toBeVisible();
    await expect(message).toHaveValue("전송하지 않은 입력");
});
for (const width of [1100, 680]) {
    test(`browser mode blocks AI sends and does not create transcript records at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 750 });
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: "AI 학습 대화 열기" }).click();
        const panel = page.getByRole("dialog", { name: "AI 학습 대화" });
        await panel.getByLabel("메시지").fill("수식 $f^{\\prime}(x)$를 설명해 줘");
        await expect(panel.getByRole("button", { name: "전송", exact: true })).toBeDisabled();
        await expect(panel.getByRole("button", { name: "마지막 질문 재시도" })).toBeDisabled();
        await expect(panel.getByLabel("메시지")).toHaveValue(/설명해 줘$/);
        await expect(panel.locator(".ai-message--user")).toHaveCount(0);
        const users = await page.evaluate(storageKey => {
            const stored = localStorage.getItem(storageKey);
            return stored ? JSON.parse(stored).conversations.flatMap((conversation: { messages: { role: string }[] }) => conversation.messages.filter(message => message.role === "user")) : [];
        }, key);
        expect(users).toEqual([]);
    });
}

for (const width of [1100, 680]) {
test(`AI deletion failure preserves the conversation and owned draft in real browser storage at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 750 });
    const sharing = { body: true, choices: true, images: false, answers: false, explanations: false, memo: false, learning: false };
    const store = { version: 1, conversations: [{ id: "delete-e2e", title: "삭제 검증", updatedAt: "2026-10-19", contextId: "ctx", materials: [], sharing, messages: [] }], drafts: [{ id: "conversation:delete-e2e", materials: [], sharing, config: { title: "초안", subject: "수학", count: 1, minutes: 30, points: 10, maxPerSource: 1, easy: 0, medium: 0, hard: 0, unitCounts: {}, prioritizeImportance: true, instruction: "" }, excluded: [], template: "free" }] };
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(({ storageKey, value }) => { localStorage.setItem(storageKey, JSON.stringify(value)); }, { storageKey: key, value: store });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "AI 학습 대화 열기" }).click();
    const panel = page.getByRole("dialog", { name: "AI 학습 대화" });
    await panel.getByText("대화 관리", { exact: true }).click();
    await expect(panel.getByRole("button", { name: "삭제", exact: true })).toBeVisible();
    await page.evaluate(storageKey => {
        const write = Storage.prototype.setItem;
        Storage.prototype.setItem = function(name, value) {
            if (name === storageKey && !JSON.parse(value).conversations.some((c:{id:string})=>c.id==="delete-e2e")) throw new DOMException("injected deletion failure", "QuotaExceededError");
            return write.call(this, name, value);
        };
    }, key);
    await panel.getByRole("button", { name: "삭제", exact: true }).click();
    await page.getByRole("dialog", { name: "대화 삭제" }).getByRole("button", { name: "확인", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("injected deletion failure");
    expect(await page.evaluate(storageKey=>JSON.parse(localStorage.getItem(storageKey)!),key)).toEqual(store);
    await page.reload({waitUntil:"domcontentloaded"});
    await page.getByRole("button",{name:"AI 학습 대화 열기"}).click();
    await expect(panel.getByRole("combobox",{name:"대화 기록"})).toHaveValue("delete-e2e");
});
}
