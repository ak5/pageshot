export type Shot = { blob: Blob; title: string; width: number; height: number; capturedAt: number };
export type CaptureState = { status: 'working'; startedAt: number } | { status: 'ready'; shot: Shot } | { status: 'error'; error: string };

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('pageshot', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('captures');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readCapture(): Promise<CaptureState | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('captures').objectStore('captures').get('latest');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function writeCapture(state?: CaptureState): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('captures', 'readwrite');
      const store = transaction.objectStore('captures');
      if (state) store.put(state, 'latest'); else store.delete('latest');
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error('Could not save the screenshot.'));
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
