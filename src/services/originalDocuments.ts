import { invoke, isTauri } from "@tauri-apps/api/core";
import type { OriginalDocument } from "../models/entry";
import { getStorageBackendKind, proxyRequest } from "./storageBackend";

export const MAX_ORIGINAL_BYTES = 100 * 1024 * 1024;
export const originalId = (id: string) => /^[a-f0-9]{64}$/.test(id);

export async function originalDigest(bytes: Uint8Array<ArrayBuffer>) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), value => value.toString(16).padStart(2, "0")).join("");
}

export function validateOriginalDocument(value: unknown): asserts value is OriginalDocument {
  const doc = value as Partial<OriginalDocument> | null;
  if (!doc || doc.version !== 1 || typeof doc.originalAssetId !== "string" || !originalId(doc.originalAssetId)
    || doc.originalAssetId !== doc.sha256 || typeof doc.filename !== "string" || !doc.filename.trim()
    || doc.filename.length > 255 || /[\\/]/.test(doc.filename) || Array.from(doc.filename).some(char => char < " ")
    || typeof doc.sourceKey !== "string" || !doc.sourceKey.trim()
    || !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(doc.mime ?? "")
    || !Number.isSafeInteger(doc.byteLength) || doc.byteLength! < 1 || doc.byteLength! > MAX_ORIGINAL_BYTES
    || !Number.isSafeInteger(doc.pageCount) || doc.pageCount! < 1 || !Array.isArray(doc.pages)
    || new Set(doc.pages.map(page => page?.physicalPage)).size !== doc.pages.length
    || doc.pages.some(page => !page || !Number.isSafeInteger(page.physicalPage) || page.physicalPage < 1
      || page.physicalPage > doc.pageCount! || typeof page.sourcePageImage !== "string" || !page.sourcePageImage)) {
    throw new Error("원본 문서 연결 형식이 올바르지 않습니다.");
  }
}

export function collectOriginalDocuments(value: unknown): OriginalDocument[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectOriginalDocuments);
  return Object.entries(value).flatMap(([key, child]) => {
    if (key !== "originalDocuments") return collectOriginalDocuments(child);
    if (child === null || child === undefined) return [];
    if (!Array.isArray(child)) throw new Error("원본 문서 목록을 확인할 수 없습니다.");
    return child.map(doc => { validateOriginalDocument(doc); return doc; });
  });
}

export function encodeOriginal(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 0x8000) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
  return btoa(chunks.join(""));
}

export function decodeOriginal(encoded: string): Uint8Array<ArrayBuffer> {
  if (encoded.length > Math.ceil(MAX_ORIGINAL_BYTES / 3) * 4) throw new Error("원본 문서 크기 제한을 초과했습니다.");
  return Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
}

export function originalMime(bytes: Uint8Array): OriginalDocument["mime"] {
  const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (text(0, 5) === "%PDF-") return "application/pdf";
  if (text(0, 8) === "\x89PNG\r\n\x1a\n") return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp";
  throw new Error("원본 PDF 또는 이미지 형식을 확인할 수 없습니다.");
}

export async function verifyOriginal(doc: OriginalDocument, bytes: Uint8Array<ArrayBuffer>) {
  validateOriginalDocument(doc);
  if (bytes.length !== doc.byteLength || originalMime(bytes) !== doc.mime || await originalDigest(bytes) !== doc.sha256) {
    throw new Error(`원본 문서 무결성 오류: ${doc.filename}`);
  }
}

async function browserAsset<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("wrong-answer-originals-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("assets");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("assets", mode);
      const request = run(tx.objectStore("assets"));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? request.error ?? new Error("원본 문서 저장이 중단되었습니다."));
      tx.onerror = () => reject(tx.error ?? request.error);
    });
  } finally {
    db.close();
  }
}

export async function storeOriginal(doc: OriginalDocument, bytes: Uint8Array<ArrayBuffer>) {
  await verifyOriginal(doc, bytes);
  if (isTauri()) await invoke("store_original_document", { id: doc.originalAssetId, bytesBase64: encodeOriginal(bytes) });
  else if (getStorageBackendKind() === "desktop-proxy") {
    await proxyRequest(`/v1/original-documents/${doc.originalAssetId}`, { method: "PUT", body: JSON.stringify({ bytesBase64: encodeOriginal(bytes) }) });
  } else {
    const id = doc.originalAssetId;
    const existing = await browserAsset<Uint8Array<ArrayBuffer> | undefined>("readonly", store => store.get(id));
    if (existing) {
      if (existing.length !== bytes.length || existing.some((byte, index) => byte !== bytes[index])) {
        throw new Error("원본 문서의 동일 해시 충돌을 확인했습니다.");
      }
      return;
    }
    try {
      await browserAsset("readwrite", store => store.add(bytes, id));
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "ConstraintError") throw error;
      const concurrent = await browserAsset<Uint8Array<ArrayBuffer> | undefined>("readonly", store => store.get(id));
      if (!concurrent || concurrent.length !== bytes.length || concurrent.some((byte, index) => byte !== bytes[index])) throw error;
    }
  }
}

export async function archiveOriginalFile(file: File, sourceKey: string, pageImages: string[], signal?: AbortSignal): Promise<OriginalDocument> {
  if (file.size > MAX_ORIGINAL_BYTES) throw new Error("원본 문서 크기 제한을 초과했습니다.");
  signal?.throwIfAborted();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = await originalDigest(bytes);
  const doc: OriginalDocument = {
    version: 1, originalAssetId: sha256, sha256, filename: file.name, sourceKey,
    mime: originalMime(bytes), byteLength: bytes.length, pageCount: pageImages.length,
    pages: pageImages.map((sourcePageImage, index) => ({ physicalPage: index + 1, sourcePageImage })),
  };
  signal?.throwIfAborted();
  await storeOriginal(doc, bytes);
  return doc;
}

export async function readOriginal(doc: OriginalDocument): Promise<Uint8Array<ArrayBuffer>> {
  validateOriginalDocument(doc);
  const id = doc.originalAssetId;
  const bytes = isTauri() ? decodeOriginal(await invoke<string>("read_original_document", { id }))
    : getStorageBackendKind() === "desktop-proxy" ? decodeOriginal((await proxyRequest<{ bytesBase64: string }>(`/v1/original-documents/${id}`)).bytesBase64)
    : await browserAsset<Uint8Array<ArrayBuffer> | undefined>("readonly", store => store.get(id));
  if (!bytes) throw new Error(`보존된 원본 문서를 찾을 수 없습니다: ${doc.filename}`);
  await verifyOriginal(doc, bytes);
  return bytes;
}
