const DATABASE_NAME = "wrong-answer-notebook-images";
const STORE_NAME = "images";
const VERSION = 1;

function supportsIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function legacyValue(key: string): string | null {
  return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("브라우저 이미지 저장소를 열지 못했습니다."));
  });
}

export async function putBrowserImage(key: string, value: string): Promise<void> {
  if (!supportsIndexedDb()) {
    localStorage.setItem(key, value);
    return;
  }
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("브라우저 이미지 저장에 실패했습니다."));
  });
  db.close();
}

export async function getBrowserImage(key: string): Promise<string | null> {
  if (!supportsIndexedDb()) return legacyValue(key);
  const db = await openDatabase();
  const value = await new Promise<string | null>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
    request.onerror = () => reject(request.error ?? new Error("브라우저 이미지를 불러오지 못했습니다."));
  });
  db.close();
  if (value !== null) return value;
  const legacy = legacyValue(key);
  if (legacy !== null) {
    await putBrowserImage(key, legacy);
    localStorage.removeItem(key);
  }
  return legacy;
}

export async function deleteBrowserImage(key: string): Promise<void> {
  if (!supportsIndexedDb()) {
    localStorage.removeItem(key);
    return;
  }
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("브라우저 이미지 삭제에 실패했습니다."));
  });
  db.close();
  localStorage.removeItem(key);
}

export async function hasBrowserImage(key: string): Promise<boolean> {
  return (await getBrowserImage(key)) !== null;
}

export async function listBrowserImages(): Promise<Record<string, string>> {
  if (!supportsIndexedDb()) {
    return Object.fromEntries(Object.keys(localStorage).filter((key) => key.startsWith("img_")).map((key) => [key, localStorage.getItem(key) ?? ""]));
  }
  const db = await openDatabase();
  const images = await new Promise<Record<string, string>>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    const keysRequest = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAllKeys();
    request.onsuccess = () => {
      keysRequest.onsuccess = () => resolve(Object.fromEntries(keysRequest.result.map((key, index) => [String(key), typeof request.result[index] === "string" ? request.result[index] : ""])));
      keysRequest.onerror = () => reject(keysRequest.error ?? new Error("브라우저 이미지 목록을 읽지 못했습니다."));
    };
    request.onerror = () => reject(request.error ?? new Error("브라우저 이미지 목록을 읽지 못했습니다."));
  });
  db.close();
  return images;
}
