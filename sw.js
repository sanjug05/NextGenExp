const CACHE = 'ais-os-shell-v2';
const SKIP = /firestore|firebaseio|googleapis|identitytoolkit|gstatic\.com\/firebasejs|securetoken/;
const CDN  = /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/;

/* Do NOT skipWaiting here — wait so the page can offer "Update now". */
self.addEventListener('install', () => {});

/* The page asks us to take over when the user accepts the update. */
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Never touch Firebase/Firestore/Auth — let the network + Firestore cache handle it.
  if (SKIP.test(url.href)) return;

  // App shell — network-first so new versions land, cache fallback offline.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, net.clone());
        return net;
      } catch (_) {
        const cached = await caches.match(req);
        return cached || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Static + CDN assets — stale-while-revalidate.
  if (url.origin === location.origin || CDN.test(url.href)) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const network = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return cached || (await network) || new Response('', { status: 504 });
    })());
  }
});
