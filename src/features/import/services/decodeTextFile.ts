export interface DecodedTextFile {
  text: string;
  encoding: "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be";
  warnings: string[];
  replacementCharacterCount: number;
}

export async function decodeTextFile(file: File): Promise<DecodedTextFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let encoding: DecodedTextFile["encoding"] = "utf-8";
  let decoderEncoding = "utf-8";
  let offset = 0;

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = "utf-16le";
    decoderEncoding = "utf-16le";
    offset = 2;
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    encoding = "utf-16be";
    decoderEncoding = "utf-16be";
    offset = 2;
  } else if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    encoding = "utf-8-bom";
    offset = 3;
  }

  let text = new TextDecoder(decoderEncoding, { fatal: false }).decode(bytes.slice(offset));
  text = text.replace(/^\uFEFF/, "");
  const replacementCharacterCount = [...text].filter((char) => char === "\uFFFD").length;
  const warnings = replacementCharacterCount > 0
    ? [`${encoding} 디코딩 중 깨진 문자 ${replacementCharacterCount}개를 발견했습니다.`]
    : [];
  return { text, encoding, warnings, replacementCharacterCount };
}
