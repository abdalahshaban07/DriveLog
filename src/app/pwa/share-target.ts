const CACHE = 'drivelog-share-v1';
const KEY = 'shared-image';

export type SharedImage = {
  blob: Blob;
  objectUrl: string;
  filename: string;
};

/** Read (and clear) an image posted via PWA share_target. */
export async function takeSharedFillImage(): Promise<SharedImage | null> {
  if (typeof caches === 'undefined') {
    return null;
  }
  try {
    const cache = await caches.open(CACHE);
    const res = await cache.match(KEY);
    if (!res) {
      return null;
    }
    await cache.delete(KEY);
    const blob = await res.blob();
    const filename = res.headers.get('x-filename') || 'shared.jpg';
    return {
      blob,
      objectUrl: URL.createObjectURL(blob),
      filename,
    };
  } catch {
    return null;
  }
}

export async function putSharedFillImage(file: Blob, filename = 'scan.jpg'): Promise<void> {
  if (typeof caches === 'undefined') {
    return;
  }
  const cache = await caches.open(CACHE);
  await cache.put(
    KEY,
    new Response(file, {
      headers: {
        'content-type': file.type || 'image/jpeg',
        'x-filename': filename,
      },
    }),
  );
}
