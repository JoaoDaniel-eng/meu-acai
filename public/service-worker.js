const CACHE_NAME = 'acai-da-roca-v20261101-menu-config-5';
const APP_SHELL = [
  '/',
  '/index.html',
  '/css/styles.css?v=20261101-menu-config-5',
  '/js/app.js?v=20261101-menu-config-5',
  '/manifest.webmanifest',
  '/images/acai-ninho-brigadeiro.png',
  '/images/acai-ninho-morango.png',
  '/images/icon-192.png',
  '/images/icon-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('acai-da-roca-') && key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const url = new URL(request.url);
  // Nunca armazenar respostas de API, dados de clientes, pedidos ou conteúdo administrativo.
  if (url.pathname.startsWith('/api/') || url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return;
  if (request.mode === 'navigate') {
    if (url.pathname !== '/' && url.pathname !== '/index.html') {
      event.respondWith(fetch(request));
      return;
    }
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put('/', response.clone()));
      return response;
    }).catch(() => caches.match('/')));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok && !response.headers.has('Set-Cookie')) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  })));
});
