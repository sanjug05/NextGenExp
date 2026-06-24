/* AIS Expansion OS — offline app-shell service worker.
   Place this file in the SAME folder as the app HTML (e.g. /aevo.html + /sw.js),
   or rename the app to index.html and keep sw.js beside it.

   Strategy:
   - Navigations (the app shell): network-first, fall back to cache when offline,
     so a fresh deploy is always picked up while online but the app still opens offline.
   - Same-origin + known CDN assets (Leaflet, Chart.js, Font Awesome, fonts):
     stale-while-revalidate.
   - Firebase / Firestore / Google identity traffic is NEVER intercepted or cached —
     it always goes straight to the network (Firestore has its own offline cache). */

const CACHE = 'ais-os-shell-v1';
const SKIP = /firestore|firebaseio|googleapis|identitytoolkit|gstatic\.com\/firebasejs|securetoken/;
const CDN  = /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/;

self.addEventListener('install', () => self.skipWaiting());

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
