// sw-miagenda.js — Service Worker MiAgenda v2.2
// P3 ROBUSTEZ: shell offline para consulta de agenda sin WiFi

const CACHE_NAME = 'miagenda-v2.2';
const SHELL = [
  '/miagenda/',
  '/miagenda/index.html',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('identitytoolkit.googleapis.com') ||
      url.hostname.includes('securetoken.googleapis.com')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response && response.status === 200 &&
            (url.origin === self.location.origin ||
             url.hostname.includes('googleapis.com') ||
             url.hostname.includes('gstatic.com'))) {
          caches.open(CACHE_NAME).then(c => c.put(e.request, response.clone()));
        }
        return response;
      }).catch(() => {
        if (e.request.mode === 'navigate') return caches.match('/miagenda/index.html');
      });
    })
  );
});
