const CACHE_NAME = 'acai-da-roca-v20261124-redesign6';
const APP_SHELL = [
  '/',
  '/index.html',
  '/css/styles.css?v=20261124-acai-redesign2',
  '/css/experience.css?v=20261124-acai-redesign4',
  '/css/original-colors.css?v=20261124-original-colors1',
  '/js/diagnostics.js?v=20261105-ignora-externos',
  '/js/site/core.js?v=20261124-acai-redesign2',
  '/js/site/checkout.js?v=20261124-acai-redesign3',
  '/js/site/reviews.js?v=20261124-acai-redesign2',
  '/js/site/account.js?v=20261124-acai-redesign2',
  '/js/site/tracking.js?v=20261124-acai-redesign2',
  '/js/site/saved-details.js?v=20261124-acai-redesign2',
  '/js/site/pwa.js?v=20261124-acai-redesign2',
  '/js/site/theme.js?v=20261124-acai-redesign2',
  '/js/site/sidemenu.js?v=20261124-acai-redesign2',
  '/js/site/settings.js?v=20261124-acai-redesign2',
  '/js/site/push.js?v=20261124-acai-redesign2',
  '/js/site/cart-storage.js?v=20261124-acai-redesign2',
  '/js/site/favorites.js?v=20261124-acai-redesign2',
  '/js/site/forgot-password.js?v=20261124-acai-redesign2',
  '/js/site/live.js?v=20261124-acai-redesign2',
  '/js/site/store-banner.js?v=20261124-acai-redesign2',
  '/js/site/builder-steps.js?v=20261124-acai-redesign2',
  '/js/site/main.js?v=20261124-acai-redesign2',
  '/manifest.webmanifest',
  '/images/acai-morango-proibido.webp',
  '/images/acai-pecado-de-amendoim.webp',
  '/images/acai-doce-tentacao.webp',
  '/images/acai-ninho-dourado.webp',
  '/images/acai-hero-flutuando.webp',
  '/images/icon-192.png',
  '/images/icon-512.png',
  '/images/icon-maskable-512.png',
  '/images/apple-touch-icon.png'
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
  if (url.pathname.startsWith('/api/') || url.pathname === '/admin' || url.pathname.startsWith('/admin/') || url.pathname === '/dev' || url.pathname.startsWith('/dev/')) return;
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

// ===== Notificações push (novo pedido para o administrador, lembrete diário para clientes) =====
// O servidor manda um JSON { title, body, url, tag, kind, requireInteraction }. Sempre mostramos a notificação:
// alguns navegadores (Safari/iOS) cancelam a permissão de quem recebe push sem exibir nada.
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const options = {
    body: String(data.body || ''),
    icon: '/images/icon-192.png',
    badge: '/images/icon-192.png',
    lang: 'pt-BR',
    data: { url: typeof data.url === 'string' ? data.url : '/' },
    requireInteraction: data.requireInteraction === true
  };
  if (data.tag) {
    options.tag = String(data.tag);
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(String(data.title || 'Açaí da Roça'), options));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  // Só abre páginas do próprio site, mesmo que o conteúdo do push traga outro endereço.
  let target = new URL('/', self.location.origin);
  try {
    const wanted = new URL(event.notification.data?.url || '/', self.location.origin);
    if (wanted.origin === self.location.origin) target = wanted;
  } catch {}
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find(w => new URL(w.url).pathname === target.pathname);
    if (open) {
      await open.focus();
      // Mesma página, só muda o trecho depois do #: não recarrega.
      try { if (target.hash && new URL(open.url).hash !== target.hash) await open.navigate(target.href); } catch {}
      return;
    }
    await self.clients.openWindow(target.href);
  })());
});
