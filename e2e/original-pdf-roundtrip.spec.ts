import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { seedBrowserStorage } from "./fixtures/syntheticLifecycle";

function pdf(mark: string, rotation: number, pageCount: number) {
  const pages = Array.from({ length: pageCount }, (_, i) => 3 + i * 2);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map(i => `${i} 0 R`).join(" ")}] /Count ${pageCount} >>`,
  ];
  for (const [i, id] of pages.entries()) {
    const drawing = `0 0 0 rg ${10 + i} 10 30 20 re f\n`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 120 160] /Rotate ${rotation} /Resources <<>> /Contents ${id + 1} 0 R >>`);
    objects.push(`<< /Length ${drawing.length} >>\nstream\n${drawing}endstream`);
  }
  let text = `%PDF-1.7\n%${mark}\n`;
  const offsets = objects.map((object, i) => {
    const offset = text.length;
    text += `${i + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  text += offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  return Buffer.from(`${text}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`, "ascii");
}

async function emptyOriginalAssets(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("wrong-answer-originals-v1");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Original store still open"));
    });
  });
}

test("preserves two same-name PDF originals through import, download and backup restore", async ({ page }, testInfo) => {
  const originals = [pdf("question", 90, 2), pdf("answer", 0, 1)];
  const hashes = originals.map(bytes => createHash("sha256").update(bytes).digest("hex"));
  const cases: Array<{ valid: boolean; text: string }> = JSON.parse(await readFile(new URL("../tools/diagram_pipeline/tests/fixtures/vision-v2-cases.json", import.meta.url), "utf8"));
  const analysis = JSON.parse(cases.find(item => item.valid)!.text);
  analysis.entries[0].title = "원본 PDF 바이트 왕복";
  analysis.sources = [{ sourceKey: "upload-1", pageCount: 2 }, { sourceKey: "upload-2", pageCount: 1 }];
  analysis.document.pageCount = 3;
  analysis.figures = [];
  const q = analysis.entries[0].questions[0];
  q.figureKeys = [];
  q.contentSegments = [{ id: "question", type: "text", text: "원본 보존 테스트 문항" }];
  q.choices = ["① 하나", "② 둘"];
  q.source.page = 2;
  q.studyAssessment.sourceAnswer.sourceKey = "upload-2";
  q.studyAssessment.sourceAnswer.page = 1;

  await seedBrowserStorage(page, []);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const prepared = await page.evaluate(async ({ analysisText, bytes }) => {
    const { rasterizeVisualImportFile } = await import("/src/utils/visualImportFiles.ts");
    const { prepareOriginalVisionImport } = await import("/src/features/import/vision/visionJob.ts");
    const { parseVisionAnalysis } = await import("/src/features/import/vision/visionSchema.ts");
    const { readOriginal, encodeOriginal } = await import("/src/services/originalDocuments.ts");
    const files = bytes.map(encoded => new File([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], "same.pdf", { type: "application/pdf" }));
    const groups = [];
    for (const [i, file] of files.entries()) {
      const pages = await rasterizeVisualImportFile(file);
      groups.push({ sourceKey: `upload-${i + 1}`, pages: pages.map((raster, index) => new File([raster], `p-${i}-${index}.png`, { type: "image/png" })) });
    }
    const result = await prepareOriginalVisionImport(parseVisionAnalysis(analysisText), groups.flatMap(group => group.pages), groups, undefined, files);
    const docs = (result.document.entries as Array<{ originalDocuments: import("../src/models/entry").OriginalDocument[] }>)[0].originalDocuments;
    return {
      document: result.document,
      docs,
      originals: await Promise.all(docs.map(async doc => encodeOriginal(await readOriginal(doc)))),
      pages: await Promise.all(result.files.map(async file => ({ name: file.name, data: encodeOriginal(new Uint8Array(await file.arrayBuffer())) }))),
    };
  }, { analysisText: JSON.stringify(analysis), bytes: originals.map(bytes => bytes.toString("base64")) });
  expect(prepared.originals).toEqual(originals.map(bytes => bytes.toString("base64")));
  expect(prepared.docs.map(doc => doc.sha256)).toEqual(hashes);
  expect(prepared.docs.map(doc => doc.pages[0].physicalPage)).toEqual([2, 1]);
  expect(prepared.docs.map(doc => doc.filename)).toEqual(["same.pdf", "same.pdf"]);

  await emptyOriginalAssets(page);
  const zip = new JSZip();
  zip.file("import.json", JSON.stringify(prepared.document));
  for (const asset of prepared.pages) zip.file(asset.name, Buffer.from(asset.data, "base64"));
  for (const [i, id] of hashes.entries()) zip.file(`original-documents-v1/${id}`, originals[i]);
  const archive = await zip.generateAsync({ type: "nodebuffer" });
  await page.getByRole("button", { name: "시험지함", exact: true }).click();
  await page.getByRole("button", { name: "+ 시험지 가져오기", exact: true }).click();
  await page.getByLabel("올인원 가져오기").setInputFiles({ name: "originals.zip", mimeType: "application/zip", buffer: archive });
  await expect(page.getByText("올인원 가져오기 완료: 1개 항목")).toBeVisible();
  await page.getByText("다른 저장 방법", { exact: true }).click();
  await page.getByRole("button", { name: "바로 저장", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "시험지 가져오기" })).toBeHidden();

  const openOriginal = async () => {
    await page.getByRole("button", { name: "시험지함", exact: true }).click();
    await page.getByRole("button", { name: /원본 PDF 바이트 왕복/ }).first().click();
    const originalMode = page.getByTestId("problem-sheet-display-exam");
    if (await originalMode.getAttribute("aria-pressed") !== "true") await originalMode.click();
    await page.getByRole("button", { name: "보존된 원본 파일" }).click();
    return page.getByRole("dialog", { name: "보존된 원본 파일" });
  };
  const assertDownload = async (dialog: Awaited<ReturnType<typeof openOriginal>>, index: number) => {
    await dialog.getByRole("combobox", { name: "원본 파일" }).selectOption(String(index));
    const event = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "원본 그대로 다운로드" }).click();
    const file = await event;
    const bytes = await readFile((await file.path())!);
    expect(file.suggestedFilename()).toBe("same.pdf");
    expect(bytes).toStrictEqual(originals[index]);
    expect(bytes.length).toBe(originals[index].length);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(hashes[index]);
  };

  await page.reload({ waitUntil: "domcontentloaded" });
  let dialog = await openOriginal();
  await expect(dialog.getByAltText("원본 2페이지")).toBeVisible();
  await dialog.getByRole("button", { name: "이전 물리 페이지" }).click();
  await expect(dialog.getByAltText("원본 1페이지")).toBeVisible();
  await assertDownload(dialog, 0);
  await assertDownload(dialog, 1);
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: /설정/ }).first().click();
  await page.getByRole("button", { name: "데이터", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "백업 만들기", exact: true }).click();
  const backupPath = (await (await download).path())!;
  const backup = JSON.parse(await readFile(backupPath, "utf8"));
  expect(Object.keys(backup.originalAssetsV1).sort()).toEqual([...hashes].sort());
  for (const [i, hash] of hashes.entries()) expect(Buffer.from(backup.originalAssetsV1[hash], "base64")).toStrictEqual(originals[i]);

  await emptyOriginalAssets(page);
  await page.evaluate(async () => {
    const { replaceBrowserImages } = await import("/src/services/api/browserImageStore.ts");
    await replaceBrowserImages({});
    localStorage.clear();
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /설정/ }).first().click();
  await page.getByRole("button", { name: "데이터", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "백업 복원", exact: true }).click();
  await page.getByRole("dialog", { name: "백업 복원" }).getByRole("button", { name: "확인", exact: true }).click();
  await (await chooser).setFiles(backupPath);
  await expect(page.getByText("백업 복원을 완료했습니다.", { exact: true })).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("wrong-answer-entries")!).entries);
  expect(restored).toStrictEqual(backup.entries);
  dialog = await openOriginal();
  await assertDownload(dialog, 0);
  await assertDownload(dialog, 1);
  testInfo.annotations.push({ type: "verified SHA-256", description: hashes.map((hash, i) => `${hash} (${originals[i].length} bytes)`).join(", ") });
});
