/** Native browser decoding checks the complete file, beyond its signature. */
export async function validateImportImage(file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const png = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((byte, index) => bytes[index] === byte);
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP";
  const valid = /\.png$/i.test(file.name) ? png : /\.jpe?g$/i.test(file.name) ? jpeg : /\.webp$/i.test(file.name) ? webp : false;
  if (!valid) throw new Error(`이미지 내용과 확장자가 다릅니다: ${file.name}`);
  try {
    const bitmap = await createImageBitmap(file);
    try { if (bitmap.width <= 0 || bitmap.height <= 0) throw new Error("빈 이미지"); }
    finally { bitmap.close(); }
  } catch (cause) { throw new Error(`이미지를 디코딩할 수 없습니다: ${file.name}`, { cause }); }
}
