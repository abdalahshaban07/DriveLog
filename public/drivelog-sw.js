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

// Tapping a reminder opens (or focuses) the app instead of doing nothing.
self.addEventListener('notificationclick', (event) => {
  // Push notifications carry their own click action: Angular's worker handles those.
  if (event.notification.data && event.notification.data.onActionClick) {
    return;
  }
  event.notification.close();
  event.waitUntil(
    (async () => {
      const scope = self.registration.scope;
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => w.url.startsWith(scope));
      if (open) {
        await open.focus();
        return;
      }
      await self.clients.openWindow(scope);
    })(),
  );
});

importScripts('./ngsw-worker.js');
