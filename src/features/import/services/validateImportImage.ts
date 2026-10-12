import { IMPORT_LIMITS } from "./importLimits";

function jpegOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 0xff) break;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > bytes.length) break;
    const length = view.getUint16(offset);
    const end = offset + length;
    if (length < 2 || end > bytes.length) break;
    if (marker === 0xe1 && length >= 16 && String.fromCharCode(...bytes.slice(offset + 2, offset + 8)) === "Exif\0\0") {
      const tiff = offset + 8;
      const byteOrder = view.getUint16(tiff);
      if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return 1;
      const little = byteOrder === 0x4949;
      if (view.getUint16(tiff + 2, little) !== 42) return 1;
      const directoryOffset = view.getUint32(tiff + 4, little);
      const directory = tiff + directoryOffset;
      if (directoryOffset < 8 || directory + 2 > end) return 1;
      const count = view.getUint16(directory, little);
      for (let index = 0; index < count; index++) {
        const entry = directory + 2 + index * 12;
        if (entry + 12 > end) return 1;
        if (view.getUint16(entry, little) !== 0x0112) continue;
        if (view.getUint16(entry + 2, little) !== 3 || view.getUint32(entry + 4, little) !== 1) return 1;
        const orientation = view.getUint16(entry + 8, little);
        return orientation >= 1 && orientation <= 8 ? orientation : 1;
      }
    }
    offset = end;
  }
  return 1;
}

function readDimensions(bytes: Uint8Array, format: "png" | "jpeg" | "webp"): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === "png") return bytes.length >= 24 ? { width: view.getUint32(16), height: view.getUint32(20) } : null;
  if (format === "jpeg") {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return null;
      const segmentLength = view.getUint16(offset);
      if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (segmentLength < 7) return null;
        return { height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) };
      }
      offset += segmentLength;
    }
    return null;
  }
  if (bytes.length < 25) return null;
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (chunk === "VP8X" && bytes.length >= 30) {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return { width, height };
  }
  if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f && bytes.length >= 25) {
    return { width: 1 + (bytes[21] | ((bytes[22] & 0x3f) << 8)), height: 1 + ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10)) };
  }
  return null;
}

function assertDecodedSize(width: number, height: number, filename: string): void {
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || width <= 0 || height <= 0
    || width > IMPORT_LIMITS.MAX_IMAGE_DIMENSION || height > IMPORT_LIMITS.MAX_IMAGE_DIMENSION
    || pixels > IMPORT_LIMITS.MAX_IMAGE_PIXELS
    || pixels * 4 > IMPORT_LIMITS.MAX_IMAGE_DECODED_BYTES) {
    throw new Error(`이미지 해상도가 허용 범위를 넘습니다: ${filename}`);
  }
}

/** Check dimensions before invoking a platform decoder, then verify full decoding. */
export async function validateImportImage(file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const png = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((byte, index) => bytes[index] === byte);
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP";
  const format = /\.png$/i.test(file.name) ? "png" : /\.jpe?g$/i.test(file.name) ? "jpeg" : /\.webp$/i.test(file.name) ? "webp" : null;
  const valid = format === "png" ? png : format === "jpeg" ? jpeg : format === "webp" ? webp : false;
  if (!valid) throw new Error(`이미지 내용과 확장자가 다릅니다: ${file.name}`);
  const dimensions = readDimensions(bytes, format!);
  if (!dimensions) throw new Error(`이미지를 디코딩할 수 없습니다. 크기 정보를 확인하지 못했습니다: ${file.name}`);
  assertDecodedSize(dimensions.width, dimensions.height, file.name);
  // SOF describes raw pixels; EXIF 5–8 swaps the displayed width and height.
  const rotated = format === "jpeg" && jpegOrientation(bytes) >= 5;
  const expectedWidth = rotated ? dimensions.height : dimensions.width;
  const expectedHeight = rotated ? dimensions.width : dimensions.height;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      assertDecodedSize(bitmap.width, bitmap.height, file.name);
      if (bitmap.width !== expectedWidth || bitmap.height !== expectedHeight) throw new Error("이미지 크기 정보가 내용과 일치하지 않습니다.");
    }
    finally { bitmap.close(); }
  } catch (cause) { throw new Error(`이미지를 디코딩할 수 없습니다: ${file.name}`, { cause }); }
}
