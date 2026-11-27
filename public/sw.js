/* LearnShift service worker: offline app shell only.
 * - Page loads: network first, cached shell when offline.
 * - Hashed build assets, fonts, icons: cache first, trimmed so old builds don't pile up.
 * - Supabase, auth, functions and every other host: never touched (no tokens or student data at rest). */
const SHELL_CACHE = 'learnshift-shell-v2';
const ASSET_CACHE = 'learnshift-assets-v2';
const KEEP = [SHELL_CACHE, ASSET_CACHE];
const MAX_ASSETS = 220;
const SHELL = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

// Every screen's code, so offline navigation works even to pages not opened yet.
async function precacheChunks() {
  try {
    const res = await fetch('/precache.json', { cache: 'no-store' });
    if (!res.ok) return;
    const { files } = await res.json();
    const cache = await caches.open(ASSET_CACHE);
    await Promise.all(files.map((f) => cache.match(f).then((hit) => hit || cache.add(f).catch(() => {}))));
  } catch {
    // best effort: pages still cache as they are visited
  }
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL))
      .then(precacheChunks)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  // Oldest entries first (insertion order): drop them past the limit.
  for (let i = 0; i < keys.length - MAX_ASSETS; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    );
    return;
  }

  if (/^\/(_expo\/static|assets|icons|fonts)\//.test(url.pathname) || url.pathname === '/pdf.worker.min.mjs') {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(req, copy).then(() => trim(c)));
            }
            return res;
          }),
      ),
    );
  }
});
