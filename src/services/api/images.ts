import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { v4 as uuidv4 } from "uuid";
import type { EntryFormData } from "../../types";
import { IMPORT_LIMITS } from "../../features/import/services/importLimits";
import { mapEntryImportImageReferences, normalizeImportImageKey } from "../../utils/importImageReferences";
import { errorMessage } from "./shared";

export const IMAGE_URL_CACHE_LIMIT = 128;
const imageUrlCache = new Map<string, string>();
/** Per-file cap for browser/Tauri image import (aligned with `IMPORT_LIMITS.MAX_IMAGE_BYTES`). */
export const MAX_IMPORT_IMAGE_BYTES = IMPORT_LIMITS.MAX_IMAGE_BYTES;

export async function pickImages(): Promise<string[]> {
  if (!isTauri()) {
    return pickImagesBrowser();
  }

  // Use the new dialog-based command which handles file selection internally
  // This prevents path injection attacks by using Tauri's native dialog
  try {
    const filenames = await invoke<string[]>("save_images_from_dialog");
    return filenames || [];
  } catch (error) {
    // User cancelled dialog is not an error
    if (String(error).includes("파일을 선택하지 않았습니다")) {
      return [];
    }
    throw new Error(errorMessage(error, "이미지를 저장하지 못했습니다."), {
      cause: error,
    });
  }
}

export function createBrowserImageKey(filename: string): string {
  return `img_${uuidv4()}_${filename}`;
}

async function validateImageHeader(file: File, extension: string): Promise<void> {
  const bytes = new Uint8Array((await file.arrayBuffer()).slice(0, 12));
  const png = bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if ((extension === "png" && !png) || (extension.startsWith("jp") && !jpeg) || (extension === "webp" && !webp)) {
    throw new Error(`${file.name}의 이미지 형식 또는 magic header를 확인할 수 없습니다.`);
  }
}

export async function saveImageFiles(files: FileList | File[]): Promise<string[]> {
  const names: string[] = [];
  try {
    for (const file of Array.from(files)) {
      const extension = file.name.match(/\.(png|jpe?g|webp)$/i)?.[1]?.toLowerCase();
      if (!extension) throw new Error(`${file.name}은(는) 지원하지 않는 이미지 형식입니다.`);
      const expectedMime = extension === "webp" ? "image/webp" : extension.startsWith("jp") ? "image/jpeg" : "image/png";
      if (file.type && file.type !== expectedMime) throw new Error(`${file.name}의 MIME 형식이 확장자와 일치하지 않습니다.`);
      if (file.size > MAX_IMPORT_IMAGE_BYTES) {
        throw new Error(`${file.name} 파일이 너무 큽니다. 이미지는 파일당 25MB 이하만 저장할 수 있습니다.`);
      }
      await validateImageHeader(file, extension);
      if (isTauri()) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const filename = await invoke<string>("save_import_image_bytes", {
          bytes,
          filename: file.name,
          mime: file.type || undefined,
        });
        names.push(filename);
        continue;
      }
      const dataUrl = await fileToDataUrl(file);
      const key = createBrowserImageKey(file.name);
      localStorage.setItem(key, dataUrl);
      names.push(key);
    }
  } catch (error) {
    await Promise.all(names.map((filename) => deleteImage(filename).catch(() => undefined)));
    throw new Error(errorMessage(error, "이미지를 저장하지 못했습니다."), { cause: error });
  }
  return names;
}

export async function saveImportAssetFiles(files: File[]): Promise<{ savedFilenames: string[]; savedAssets: Array<{ sourceName: string; sourceKey: string; savedFilename: string }>; sourceToSaved: Record<string, string> }> {
  const normalizedKeys = files.map((file) => normalizeImportImageKey(file.name));
  const duplicate = normalizedKeys.find((key, index) => normalizedKeys.indexOf(key) !== index);
  if (duplicate) throw new Error(`중복된 이미지 파일명이 있습니다: ${duplicate}`);
  const savedFilenames: string[] = [];
  const savedAssets: Array<{ sourceName: string; sourceKey: string; savedFilename: string }> = [];
  const sourceToSaved: Record<string, string> = {};
  try {
    for (const file of files) {
      const [saved] = await saveImageFiles([file]);
      savedFilenames.push(saved);
      const sourceKey = normalizeImportImageKey(file.name);
      sourceToSaved[sourceKey] = saved;
      savedAssets.push({ sourceName: file.name, sourceKey, savedFilename: saved });
    }
  } catch (error) {
    await Promise.all(savedFilenames.map((filename) => deleteImage(filename).catch(() => undefined)));
    throw error;
  }
  return { savedFilenames, savedAssets, sourceToSaved };
}

export function rewriteImportAssetReferences<T extends Partial<EntryFormData>>(data: T, sourceToSaved: Record<string, string>): T {
  return mapEntryImportImageReferences(data, (filename) => sourceToSaved[normalizeImportImageKey(filename)] ?? filename) as T;
}

async function pickImagesBrowser(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = async () => {
      const files = input.files;
      if (!files?.length) {
        resolve([]);
        return;
      }
      try {
        const names = await saveImageFiles(files);
        resolve(names);
      } catch (error) {
        reject(error);
      }
    };
    input.click();
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function getImageUrl(filename: string): Promise<string> {
  const cached = imageUrlCache.get(filename);
  if (cached) {
    imageUrlCache.delete(filename);
    imageUrlCache.set(filename, cached);
    return cached;
  }

  const localDataUrl = localStorage.getItem(filename);
  if (localDataUrl) {
    return localDataUrl;
  }

  if (!isTauri()) {
    return "";
  }

  try {
    const path = await invoke<string>("get_image_file_path", { filename });
    const url = convertFileSrc(path);
    cacheImageUrl(filename, url);
    return url;
  } catch (error) {
    throw new Error(errorMessage(error, "이미지를 불러오지 못했습니다."), {
      cause: error,
    });
  }
}

function cacheImageUrl(filename: string, url: string): void {
  imageUrlCache.delete(filename);
  imageUrlCache.set(filename, url);
  while (imageUrlCache.size > IMAGE_URL_CACHE_LIMIT) {
    const oldest = imageUrlCache.keys().next().value;
    if (oldest === undefined) return;
    imageUrlCache.delete(oldest);
  }
}

export function clearImageUrlCache(filename?: string): void {
  if (filename) imageUrlCache.delete(filename);
  else imageUrlCache.clear();
}

export async function deleteImage(filename: string): Promise<void> {
  try {
    clearImageUrlCache(filename);
    if (localStorage.getItem(filename)) {
      localStorage.removeItem(filename);
      if (!isTauri()) return;
    }
    if (!isTauri()) {
      return;
    }
    await invoke("delete_image", { filename });
  } catch (error) {
    throw new Error(errorMessage(error, "이미지를 삭제하지 못했습니다."), {
      cause: error,
    });
  }
}
