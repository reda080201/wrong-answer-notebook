import JSZip from "jszip";
import { IMPORT_LIMITS } from "./importLimits";
import { normalizeImportImageKey } from "../../../utils/importImageReferences";

export interface ZipImportProgress { phase: "inspect" | "extract"; completed: number; total: number; }
export interface ZipImportAsset { sourcePath: string; file: File; }
export interface ZipImportResult { jsonText: string; jsonName: string; imageFiles: File[]; imageAssets: ZipImportAsset[]; }

const isImage = (name: string) => /\.(png|jpe?g|webp)$/i.test(name);
const imageType = (name: string) => name.toLowerCase().endsWith(".webp") ? "image/webp" : /\.jpe?g$/i.test(name) ? "image/jpeg" : "image/png";
const basename = (name: string) => name.split("/").at(-1) ?? name;
const safePath = (name: string) => Boolean(name) && !name.startsWith("/") && !name.includes("\\") && !name.split("/").some((part) => part === ".." || !part);

function uncompressedSize(entry: JSZip.JSZipObject): number {
  const value = (entry as unknown as { _data?: { uncompressedSize?: unknown } })._data?.uncompressedSize;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

async function extractImages(entries: JSZip.JSZipObject[], initialBytes: number, signal?: AbortSignal, onProgress?: (progress: ZipImportProgress) => void) {
  const output: ZipImportAsset[] = new Array(entries.length);
  let next = 0;
  let completed = 0;
  let extractedBytes = initialBytes;
  const worker = async () => {
    while (next < entries.length) {
      if (signal?.aborted) throw new DOMException("가져오기를 취소했습니다.", "AbortError");
      const index = next++;
      const entry = entries[index];
      const blob = await entry.async("blob");
      extractedBytes += blob.size;
      if (extractedBytes > IMPORT_LIMITS.MAX_UNCOMPRESSED_BYTES) throw new Error("ZIP의 실제 압축 해제 크기가 1GB를 초과합니다.");
      if (blob.size > IMPORT_LIMITS.MAX_IMAGE_BYTES) throw new Error(`\`${basename(entry.name)}\`의 크기가 이미지 한 장 제한인 ${IMPORT_LIMITS.MAX_IMAGE_BYTES / 1024 / 1024}MB를 초과합니다.`);
      output[index] = { sourcePath: entry.name, file: new File([blob], basename(entry.name), { type: imageType(entry.name) }) };
      completed++;
      onProgress?.({ phase: "extract", completed, total: entries.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(IMPORT_LIMITS.MAX_ZIP_EXTRACT_CONCURRENCY, entries.length) }, worker));
  return output;
}

export async function readZipImport(zipFile: File, options: { signal?: AbortSignal; onProgress?: (progress: ZipImportProgress) => void } = {}): Promise<ZipImportResult> {
  if (zipFile.size > IMPORT_LIMITS.MAX_ARCHIVE_BYTES) throw new Error(`ZIP 파일이 ${IMPORT_LIMITS.MAX_ARCHIVE_BYTES / 1024 / 1024}MB를 초과합니다.`);
  options.onProgress?.({ phase: "inspect", completed: 0, total: 0 });
  const zip = await JSZip.loadAsync(zipFile);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.some((entry) => !safePath(entry.name))) throw new Error("ZIP에 안전하지 않은 경로가 포함되어 있습니다.");
  const allowed = entries.filter((entry) => entry.name.toLowerCase().endsWith(".json") || isImage(entry.name));
  if (allowed.reduce((sum, entry) => sum + uncompressedSize(entry), 0) > IMPORT_LIMITS.MAX_UNCOMPRESSED_BYTES) throw new Error("ZIP의 압축 해제 예상 크기가 1GB를 초과합니다.");
  const jsonEntries = allowed.filter((entry) => entry.name.toLowerCase().endsWith(".json"));
  const json = jsonEntries.find((entry) => basename(entry.name).toLowerCase() === "import.json") ?? jsonEntries.find((entry) => basename(entry.name).toLowerCase() === "questions.json") ?? (jsonEntries.length === 1 ? jsonEntries[0] : undefined);
  if (!json) throw new Error("ZIP 안에는 import.json 또는 JSON 파일 1개가 필요합니다.");
  if (uncompressedSize(json) > IMPORT_LIMITS.MAX_JSON_BYTES) throw new Error(`JSON 파일이 ${IMPORT_LIMITS.MAX_JSON_BYTES / 1024 / 1024}MB를 초과합니다.`);
  const images = allowed.filter((entry) => isImage(entry.name));
  const imageKeys = images.map((entry) => normalizeImportImageKey(entry.name));
  const duplicateKey = imageKeys.find((key, index) => imageKeys.indexOf(key) !== index);
  if (duplicateKey) throw new Error(`중복된 이미지 파일명이 있습니다: ${duplicateKey}`);
  if (images.length > IMPORT_LIMITS.MAX_IMAGE_COUNT) throw new Error(`ZIP에 이미지가 ${images.length}개 있습니다. 현재 한 번에 최대 ${IMPORT_LIMITS.MAX_IMAGE_COUNT}개까지 가져올 수 있습니다.`);
  const oversized = images.find((entry) => uncompressedSize(entry) > IMPORT_LIMITS.MAX_IMAGE_BYTES);
  if (oversized) throw new Error(`\`${basename(oversized.name)}\`의 크기가 이미지 한 장 제한인 ${IMPORT_LIMITS.MAX_IMAGE_BYTES / 1024 / 1024}MB를 초과합니다.`);
  const jsonBlob = await json.async("blob");
  if (jsonBlob.size > IMPORT_LIMITS.MAX_JSON_BYTES) throw new Error(`JSON 파일이 ${IMPORT_LIMITS.MAX_JSON_BYTES / 1024 / 1024}MB를 초과합니다.`);
  const [jsonText, imageAssets] = await Promise.all([jsonBlob.text(), extractImages(images, jsonBlob.size, options.signal, options.onProgress)]);
  return { jsonText, jsonName: basename(json.name), imageFiles: imageAssets.map((asset) => asset.file), imageAssets };
}
