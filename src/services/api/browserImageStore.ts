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

async function writeImages(operation: (store: IDBObjectStore) => void, message: string): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error(message));
      transaction.onabort = () => reject(transaction.error ?? new Error(message));
      try {
        operation(transaction.objectStore(STORE_NAME));
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  } finally {
    db.close();
  }
}

async function migrateLegacyBrowserImages(): Promise<void> {
  if (!supportsIndexedDb()) return;
  const legacy = Object.fromEntries(
    Object.keys(localStorage)
      .filter((key) => key.startsWith("img_"))
      .map((key) => [key, localStorage.getItem(key)])
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  if (!Object.keys(legacy).length) return;
  await writeImages(store => {
    for (const [key, value] of Object.entries(legacy)) store.put(value, key);
  }, "기존 브라우저 이미지 이전에 실패했습니다.");
  for (const key of Object.keys(legacy)) localStorage.removeItem(key);
}

export async function putBrowserImage(key: string, value: string): Promise<void> {
  if (!supportsIndexedDb()) {
    localStorage.setItem(key, value);
    return;
  }
  await writeImages(store => { store.put(value, key); }, "브라우저 이미지 저장에 실패했습니다.");
}

export async function getBrowserImage(key: string): Promise<string | null> {
  if (!supportsIndexedDb()) return legacyValue(key);
  const db = await openDatabase();
  let value: string | null;
  try {
    value = await new Promise<string | null>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
      request.onerror = () => reject(request.error ?? new Error("브라우저 이미지를 불러오지 못했습니다."));
    });
  } finally {
    db.close();
  }
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
  await writeImages(store => { store.delete(key); }, "브라우저 이미지 삭제에 실패했습니다.");
  localStorage.removeItem(key);
}

export async function replaceBrowserImages(images: Record<string, string>): Promise<void> {
  if (!supportsIndexedDb()) {
    for (const key of Object.keys(localStorage).filter((key) => key.startsWith("img_"))) localStorage.removeItem(key);
    for (const [key, value] of Object.entries(images)) localStorage.setItem(key, value);
    return;
  }
  await migrateLegacyBrowserImages();
  await writeImages(store => {
    store.clear();
    for (const [key, value] of Object.entries(images)) store.put(value, key);
  }, "브라우저 이미지 복원에 실패했습니다.");
  for (const key of Object.keys(localStorage).filter((key) => key.startsWith("img_"))) localStorage.removeItem(key);
}

export async function hasBrowserImage(key: string): Promise<boolean> {
  return (await getBrowserImage(key)) !== null;
}

export async function listBrowserImages(): Promise<Record<string, string>> {
  if (!supportsIndexedDb()) {
    return Object.fromEntries(Object.keys(localStorage).filter((key) => key.startsWith("img_")).map((key) => [key, localStorage.getItem(key) ?? ""]));
  }
  await migrateLegacyBrowserImages();
  const db = await openDatabase();
  try {
    return await new Promise<Record<string, string>>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    const keysRequest = store.getAllKeys();
    let values: unknown[] | undefined;
    let keys: IDBValidKey[] | undefined;
    const finish = () => {
      if (!values || !keys) return;
      resolve(Object.fromEntries(keys.map((key, index) => [String(key), typeof values?.[index] === "string" ? values[index] as string : ""])));
    };
    request.onsuccess = () => { values = request.result; finish(); };
    keysRequest.onsuccess = () => { keys = keysRequest.result; finish(); };
    request.onerror = () => reject(request.error ?? new Error("브라우저 이미지 목록을 읽지 못했습니다."));
    keysRequest.onerror = () => reject(keysRequest.error ?? new Error("브라우저 이미지 목록을 읽지 못했습니다."));
    transaction.onerror = () => reject(transaction.error ?? new Error("브라우저 이미지 목록을 읽지 못했습니다."));
    });
  } finally {
    db.close();
  }
}
