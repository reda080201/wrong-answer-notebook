import { expect, test } from "@playwright/test";

test("canonical question PNG embeds and rasterizes complex KaTeX", async ({ page }, testInfo) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { renderCanonicalQuestionToPng } = await import("/src/features/export/services/questionPng.ts");
    const blob = await renderCanonicalQuestionToPng({
      question: {
        questionNumber: "9",
        position: 1,
        questionText: "분수 $\\frac{x+1}{x-1}$와 제곱근 $\\sqrt{x^2+1}$을 계산하시오.",
        conditions: [],
        equations: ["\\int_1^3\\left(f'(x)+f(2)\\right)\\,dx=2", "x^{2}+y_{1}"],
        choices: [],
        contentSegments: [
          { id: "body", type: "text", text: "분수 $\\frac{x+1}{x-1}$와 제곱근 $\\sqrt{x^2+1}$을 계산하시오." },
          { id: "integral", type: "equation", latex: "\\int_1^3\\left(f'(x)+f(2)\\right)\\,dx=2", display: true },
          { id: "scripts", type: "equation", latex: "x^{2}+y_{1}", display: true },
        ],
        figureIds: [],
      },
      figures: [],
      resolveImageUrl: async () => null,
    }, { scope: "question", background: "white", scale: 2, filename: "math.png" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const header = new DataView(bytes.buffer);
    const pngWidth = header.getUint32(16);
    const pngHeight = header.getUint32(20);
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let inkPixels = 0;
    for (let index = 0; index < pixels.length; index += 16) {
      if (pixels[index] < 230 || pixels[index + 1] < 230 || pixels[index + 2] < 230) inkPixels += 1;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("PNG decode failed"));
      reader.readAsDataURL(blob);
    });
    const host = document.createElement("section");
    host.setAttribute("data-testid", "question-png-evidence");
    const image = document.createElement("img");
    image.src = dataUrl;
    image.alt = "복잡한 수식 문항 PNG";
    host.append(image);
    document.body.append(host);
    return { width: bitmap.width, height: bitmap.height, pngWidth, pngHeight, blobSize: blob.size, inkPixels, dataUrl };
  });

  expect(result.pngWidth, JSON.stringify(result)).toBeGreaterThan(1000);
  expect(result.width, JSON.stringify(result)).toBeGreaterThan(1000);
  expect(result.height).toBeGreaterThan(300);
  expect(result.inkPixels).toBeGreaterThan(1000);
  await testInfo.attach("question-png-complex-katex", {
    body: Buffer.from(result.dataUrl.split(",")[1], "base64"),
    contentType: "image/png",
  });
  await page.locator("[data-testid='question-png-evidence']").screenshot({
    path: testInfo.outputPath("question-png-complex-katex.png"),
  });
});
