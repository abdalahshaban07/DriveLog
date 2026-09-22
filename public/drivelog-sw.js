/* DriveLog SW: share-target bridge, then Angular ngsw. */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isShare =
    event.request.method === 'POST' &&
    (url.pathname.endsWith('/share-target') || url.pathname.endsWith('/share-target/'));
  if (!isShare) {
    return;
  }
  event.respondWith(
    (async () => {
      try {
        const formData = await event.request.clone().formData();
        const file =
          formData.get('images') ||
          formData.get('image') ||
          formData.get('file');
        if (file && typeof file === 'object' && 'arrayBuffer' in file) {
          const cache = await caches.open('drivelog-share-v1');
          await cache.put(
            'shared-image',
            new Response(file, {
              headers: {
                'content-type': file.type || 'image/jpeg',
                'x-filename': file.name || 'shared.jpg',
              },
            }),
          );
        }
      } catch {
        /* ignore parse errors — still open fill-up */
      }
      const dest = new URL('fill-up?shared=1', self.registration.scope);
      return Response.redirect(dest.href, 303);
    })(),
  );
});

importScripts('./ngsw-worker.js');
