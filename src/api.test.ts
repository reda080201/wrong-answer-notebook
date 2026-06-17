import { describe, expect, it } from "vitest";
import { builtInPromptTemplates, saveImageFiles } from "./api";

describe("builtInPromptTemplates", () => {
  it("keeps the sheet JSON prompt strict about raw JSON, printed content, and excluded handwriting", () => {
    const prompt = builtInPromptTemplates.find((template) => template.id === "builtin-sheet-answer-json");

    expect(prompt?.content).toContain("도표/그래프/표");
    expect(prompt?.content).toContain("순수 JSON 객체 1개");
    expect(prompt?.content).toContain("학생 풀이 흔적은 question, memo, importantNotes, answerKey 어디에도 넣지 마");
    expect(prompt?.content).toContain("needsReview");
    expect(prompt?.content).toContain("모든 문항에 같은 difficulty를 반복해서 채우지 마");
    expect(prompt?.content).not.toContain('"tags"');
    expect(prompt?.content).not.toContain('"difficulty":');
  });

  it("adds a PNG package prompt without base64 image output", () => {
    const prompt = builtInPromptTemplates.find((template) => template.id === "builtin-sheet-png-package");

    expect(prompt?.content).toContain("import.json");
    expect(prompt?.content).toContain("figures");
    expect(prompt?.content).toContain("graph_1.png");
    expect(prompt?.content).toContain("base64 이미지");
    expect(prompt?.content).not.toContain('"tags"');
  });
});

describe("image file security limits", () => {
  it("rejects oversized browser image files", async () => {
    const largeImage = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.png", {
      type: "image/png",
    });

    await expect(saveImageFiles([largeImage])).rejects.toThrow("10MB 이하");
  });
});
