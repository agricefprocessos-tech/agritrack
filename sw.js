/* AgriTrack PWA — Service Worker */
const CACHE = 'agritrack-v3';
const PRECACHE = [
  '/agritrack/agritrack_dashboard.html',
  '/agritrack/manifest.json',
  '/agritrack/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Only intercept same-origin GET requests; bypass GAS API calls
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.hostname === 'script.google.com' || url.hostname === 'fonts.googleapis.com') return;

  // Network-first: app em desenvolvimento ativo, freshness importa mais que
  // velocidade. Cache só entra como fallback se a rede falhar (uso offline).
  // (Estratégia anterior era cache-first e deixava usuários presos numa
  // versão antiga indefinidamente, mesmo com deploys novos no ar.)
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.status === 200 && res.type !== 'opaque') {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
