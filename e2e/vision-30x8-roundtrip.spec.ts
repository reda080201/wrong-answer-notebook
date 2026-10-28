import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import JSZip from "jszip";
import { seedBrowserStorage } from "./fixtures/syntheticLifecycle";

const inputDir = resolve("build/vision-30x8/input");
const cliZipPath = resolve("build/vision-30x8/output/output-import-v2.zip");

test("30 synthetic questions and 8 original-only figures match CLI crops and survive import, reload, backup and restore", async ({ page }) => {
  const cliZipBytes = await readFile(cliZipPath);
  const cliZip = await JSZip.loadAsync(cliZipBytes);
  const cliDocument = JSON.parse(await cliZip.file("import.json")!.async("string"));
  const cliEntry = cliDocument.entries[0];
  const analysisText = await readFile(resolve(inputDir, "analysis.json"), "utf8");
  const sourceBytes = await readFile(resolve(inputDir, "source.png"));
  const cliImages = await Promise.all(cliEntry.figures.map(async (figure: { questionNumber: string; original: { image: string; crop: unknown } }) => ({
    questionNumber: figure.questionNumber,
    crop: figure.original.crop,
    base64: (await cliZip.file(figure.original.image)!.async("base64")),
  })));

  await seedBrowserStorage(page, []);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  // Run the browser's original-only preparation against the same synthetic page
  // and observations used to build the CLI job. Compare crop pixels and structure.
  const originalOnly = await page.evaluate(async ({ analysisText, sourceBase64, cliImages }) => {
    const { parseVisionAnalysis } = await import("/src/features/import/vision/visionSchema.ts");
    const { prepareOriginalVisionImport } = await import("/src/features/import/vision/visionJob.ts");
    const bytes = Uint8Array.from(atob(sourceBase64), character => character.charCodeAt(0));
    const source = new File([bytes], "synthetic-page.png", { type: "image/png" });
    const prepared = await prepareOriginalVisionImport(parseVisionAnalysis(analysisText), [source]);
    const entry = (prepared.document.entries as Array<Record<string, unknown>>)[0];
    const questions = entry.questions as Array<{ questionNumber: string; questionText: string; contentSegments: Array<{ type: string; figureId?: string }>; choices: string[]; source: { page: number } }>;
    const figures = entry.figures as Array<{ questionNumber: string; id: string; original: { image: string; crop: unknown }; source: string; preferredRepresentation: string }>;
    const answers = entry.answerKey as Array<{ questionNumber: string; answer: string; intent?: string; notes?: string; choiceJudgements?: unknown; sourceNote?: string; answerProvenance?: unknown }>;
    const questionMeta = entry.questionMeta as Array<{ questionNumber: string; difficultyScore?: number; rating?: { importanceScore?: number }; studyAssessment?: { sourceAnswer: { status: string } } }>;
    const learningBlocks = entry.learningBlocks as Array<{ sourceQuestionNumber?: string; content: string; reviewStatus: string }>;
    const fileByName = new Map(prepared.files.map(file => [file.name, file]));
    const toBase64 = async (file: File) => {
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(reader.error); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file); });
      return dataUrl.slice(dataUrl.indexOf(",") + 1);
    };
    const pixels = async (base64: string) => {
      const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
      const bitmap = await createImageBitmap(blob);
      try {
        const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
        const context = canvas.getContext("2d")!; context.drawImage(bitmap, 0, 0);
        return { width: bitmap.width, height: bitmap.height, data: [...context.getImageData(0, 0, bitmap.width, bitmap.height).data] };
      } finally { bitmap.close(); }
    };
    const native = await Promise.all(figures.map(async figure => ({
      questionNumber: figure.questionNumber,
      crop: figure.original.crop,
      source: figure.source,
      preferredRepresentation: figure.preferredRepresentation,
      pixels: await pixels(await toBase64(fileByName.get(figure.original.image)!)),
    })));
    const cli = await Promise.all(cliImages.map(async figure => ({ questionNumber: figure.questionNumber, crop: figure.crop, pixels: await pixels(figure.base64) })));
    return {
      questionCount: questions.length,
      figureCount: figures.length,
      answerCount: answers.length,
      questionMetaCount: questionMeta.length,
      learningBlockCount: learningBlocks.length,
      questionNumbers: questions.map(question => question.questionNumber),
      questionTexts: questions.map(question => question.questionText),
      figureQuestionNumbers: figures.map(figure => figure.questionNumber),
      sourcePages: [...new Set(questions.map(question => question.source.page))],
      segmentTypes: questions.map(question => question.contentSegments.map(segment => segment.type)),
      choices: questions.map(question => question.choices.map(choice => choice.replace(/\[FIGURE:[^\]]+\]/g, "[FIGURE]"))),
      answers: answers.map(answer => ({ questionNumber: answer.questionNumber, answer: answer.answer, intent: answer.intent, notes: answer.notes, choiceJudgements: answer.choiceJudgements, sourceNote: answer.sourceNote, answerProvenance: answer.answerProvenance })),
      assessments: questionMeta.map(meta => ({ questionNumber: meta.questionNumber, difficulty: meta.difficultyScore, importance: meta.rating?.importanceScore, sourceAnswerStatus: meta.studyAssessment?.sourceAnswer.status })),
      learning: learningBlocks.map(block => ({ sourceQuestionNumber: block.sourceQuestionNumber, content: block.content, reviewStatus: block.reviewStatus })),
      document: prepared.document,
      assets: await Promise.all(prepared.files.map(async file => ({ name: file.name, base64: await toBase64(file) }))),
      native, cli,
    };
  }, {
    analysisText,
    sourceBase64: sourceBytes.toString("base64"),
    cliImages,
  });

  expect(originalOnly.questionCount).toBe(30);
  expect(originalOnly.figureCount).toBe(8);
  expect(originalOnly.answerCount).toBe(30);
  expect(originalOnly.questionMetaCount).toBe(30);
  expect(originalOnly.learningBlockCount).toBe(30);
  expect(originalOnly.questionNumbers).toEqual(cliEntry.questions.map((question: { questionNumber: string }) => question.questionNumber));
  expect(originalOnly.questionTexts).toEqual(cliEntry.questions.map((question: { questionText: string }) => question.questionText));
  expect(originalOnly.segmentTypes).toEqual(cliEntry.questions.map((question: { contentSegments: Array<{ type: string }> }) => question.contentSegments.map(segment => segment.type)));
  expect(originalOnly.choices).toEqual(cliEntry.questions.map((question: { choices: string[] }) => question.choices.map(choice => choice.replace(/\[FIGURE:[^\]]+\]/g, "[FIGURE]"))));
  expect(originalOnly.figureQuestionNumbers).toEqual(cliEntry.figures.map((figure: { questionNumber: string }) => figure.questionNumber));
  expect(originalOnly.sourcePages).toEqual([1]);
  expect(originalOnly.native.every(figure => figure.source === "original" && figure.preferredRepresentation === "original")).toBe(true);
  expect(originalOnly.native.map(figure => figure.crop)).toEqual(originalOnly.cli.map(figure => figure.crop));
  expect(originalOnly.native.map(figure => figure.questionNumber)).toEqual(originalOnly.cli.map(figure => figure.questionNumber));
  expect(originalOnly.native.map(figure => [figure.pixels.width, figure.pixels.height, figure.pixels.data])).toEqual(originalOnly.cli.map(figure => [figure.pixels.width, figure.pixels.height, figure.pixels.data]));
  expect(originalOnly.segmentTypes.map(segments => segments.filter(type => type === "figure").length).reduce((sum, count) => sum + count, 0)).toBe(8);
  expect(originalOnly.assessments).toHaveLength(30);
  expect(originalOnly.assessments.every(item => item.difficulty === 72 && item.importance === 85 && item.sourceAnswerStatus === "conflict")).toBe(true);
  expect(originalOnly.answers.map(({ questionNumber, answer, intent, notes, choiceJudgements, sourceNote, answerProvenance }) => ({ questionNumber, answer, intent, notes, choiceJudgements, sourceNote, answerProvenance }))).toEqual(cliEntry.answerKey.map(({ questionNumber, answer, intent, notes, choiceJudgements, sourceNote, answerProvenance }: { questionNumber: string; answer: string; intent: string; notes: string; choiceJudgements: unknown; sourceNote: string; answerProvenance: unknown }) => ({ questionNumber, answer, intent, notes, choiceJudgements, sourceNote, answerProvenance })));
  expect(originalOnly.learning.map(item => [item.sourceQuestionNumber, item.content, item.reviewStatus])).toEqual(cliEntry.learningBlocks.map((item: { sourceQuestionNumber: string; content: string; reviewStatus: string }) => [item.sourceQuestionNumber, item.content, item.reviewStatus]));

  const assertSavedCounts = async (title: string) => {
    const result = await page.evaluate(async targetTitle => {
      const { getImageUrl } = await import("/src/api.ts");
      const storage = JSON.parse(localStorage.getItem("wrong-answer-entries") ?? "{}");
      const entry = storage.entries.find((item: { title: string }) => item.title === targetTitle);
      const storedImages = entry ? await Promise.all(entry.figures.map(async (figure: { original?: { image?: string } }) => {
        if (!figure.original?.image) return false;
        const url = await getImageUrl(figure.original.image);
        if (!url) return false;
        const response = await fetch(url);
        const image = await createImageBitmap(await response.blob());
        try { return image.width > 0 && image.height > 0; } finally { image.close(); }
      })) : [];
      return entry && {
        questionCount: entry.structuredQuestions?.length,
        title: entry.title,
        figureCount: entry.figures?.length,
        sourceCount: entry.sourcePageImages?.length,
        allFigureImagesStored: storedImages.length === 8 && storedImages.every(Boolean),
        figureSegments: entry.structuredQuestions.filter((question: { contentSegments?: Array<{ type: string }> }) => question.contentSegments?.some(segment => segment.type === "figure")).length,
      };
    }, title);
    expect(result).toEqual({ questionCount: 30, title, figureCount: 8, sourceCount: 1, allFigureImagesStored: true, figureSegments: 8 });
  };
  const roundtrip = async (name: string, buffer: Buffer, title: string) => {
    await page.evaluate(async () => {
      const { replaceBrowserImages } = await import("/src/services/api/browserImageStore.ts");
      await replaceBrowserImages({});
      localStorage.setItem("wrong-answer-entries", JSON.stringify({ schemaVersion: 2, entries: [] }));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "시험지함", exact: true }).click();
    await page.getByRole("button", { name: "+ 시험지 가져오기", exact: true }).click();
    await page.getByLabel("올인원 가져오기").setInputFiles({ name, mimeType: "application/zip", buffer });
    await expect(page.getByText("올인원 가져오기 완료: 1개 항목")).toBeVisible();
    await page.getByText("다른 저장 방법", { exact: true }).click();
    await page.getByRole("button", { name: "바로 저장", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "시험지 가져오기" })).toBeHidden();
    await assertSavedCounts(title);
    await page.reload({ waitUntil: "domcontentloaded" });
    await assertSavedCounts(title);

    await page.getByRole("button", { name: /설정/ }).first().click();
    await page.getByRole("button", { name: "데이터", exact: true }).click();
    const backupDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "백업 만들기", exact: true }).click();
    const backupPath = await (await backupDownload).path();
    expect(backupPath).toBeTruthy();
    const backupPayload = JSON.parse(await readFile(backupPath!, "utf8"));
    const backupEntry = backupPayload.entries.find((item: { title: string }) => item.title.includes("30문항·8그림"));
    expect(backupEntry.structuredQuestions).toHaveLength(30);
    expect(backupEntry.figures).toHaveLength(8);

    await page.evaluate(async () => {
      const { replaceBrowserImages, listBrowserImageKeys } = await import("/src/services/api/browserImageStore.ts");
      await replaceBrowserImages({});
      if ((await listBrowserImageKeys()).length !== 0) throw new Error("isolated image store was not cleared");
      localStorage.setItem("wrong-answer-entries", JSON.stringify({ schemaVersion: 2, entries: [] }));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: /설정/ }).first().click();
    await page.getByRole("button", { name: "데이터", exact: true }).click();
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "백업 복원", exact: true }).click();
    await page.getByRole("dialog", { name: "백업 복원" }).getByRole("button", { name: "확인", exact: true }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(backupPath!);
    await expect(page.getByText("백업 복원을 완료했습니다.", { exact: true })).toBeVisible();
    await assertSavedCounts(title);
    await page.reload({ waitUntil: "domcontentloaded" });
    await assertSavedCounts(title);
  };

  const originalOnlyZip = new JSZip();
  originalOnlyZip.file("import.json", JSON.stringify(originalOnly.document));
  for (const asset of originalOnly.assets) originalOnlyZip.file(asset.name, Buffer.from(asset.base64, "base64"));
  const originalOnlyZipBuffer = await originalOnlyZip.generateAsync({ type: "nodebuffer", compression: "STORE" });
  await roundtrip("synthetic-30x8-cli.zip", cliZipBytes, cliEntry.title);
  await roundtrip("synthetic-30x8-original-only.zip", originalOnlyZipBuffer, "합성 30문항·8그림 원본-only 확인");
});
