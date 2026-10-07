self.addEventListener('install', e => {
  e.waitUntil(
    caches.open('preechbot-v1').then(c => c.addAll(['/', '/index.html', '/manifest.json', '/logo.png', '/sw.js']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== 'preechbot-v1').map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Only cache GET
  if (e.request.method !== 'GET') return;
  // Network-first for API, cache-first for static
  const isApi = url.pathname.startsWith('/api/');
  e.respondWith(
    (isApi ? fetch(e.request) : caches.match(e.request))
      .then(r => r || fetch(e.request))
      .catch(() => isApi ? new Response('[]', {headers: {'Content-Type': 'application/json'}}) : caches.match('/index.html'))
  );
});