// sw.js — Service Worker for 處置股雷達
const CACHE_NAME = 'disposal-radar-v1.2';
const ASSETS = [
  './index.html',
  './app.js',
  './manifest.json',
  './icon.svg',
];

// Install: cache all assets
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS).catch(e => console.warn('Cache addAll partial fail:', e)))
  );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for assets, network-first for API
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API requests: network first, no caching
  if (url.hostname.includes('twse.com.tw') || url.hostname.includes('tpex.org.tw') || url.hostname.includes('corsproxy.io')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response('{"stat":"ERROR"}', { headers: { 'Content-Type': 'application/json' } }))
    );
    return;
  }

  // App assets: cache first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

// Message handler from main app
self.addEventListener('message', event => {
  const { type, stocks, time } = event.data || {};

  if (type === 'SCHEDULE_MORNING_ALERT') {
    if (!stocks || stocks.length === 0) return;
    const now = Date.now();
    const target = new Date();
    target.setHours(8, 30, 0, 0);
    if (target.getTime() <= now) target.setDate(target.getDate() + 1);
    const delay = target.getTime() - now;

    setTimeout(() => {
      const names = stocks.map(s => s.name).join('、');
      self.registration.showNotification('📡 處置股雷達 — 今日出關提醒', {
        body: `今天出關：${names}`,
        icon: './icon.svg',
        tag: 'morning-alert',
        requireInteraction: true,
      });
    }, delay);
  }

  if (type === 'SCHEDULE_CLOSE_ALERT') {
    if (!stocks || stocks.length === 0) return;
    const now = Date.now();
    const target = new Date();
    target.setHours(16, 5, 0, 0);
    if (target.getTime() <= now) target.setDate(target.getDate() + 1);
    const delay = target.getTime() - now;

    setTimeout(() => {
      self.registration.showNotification('📊 處置股雷達 — 收盤更新', {
        body: `目前有 ${stocks.length} 支處置股，請確認最新狀態`,
        icon: './icon.svg',
        tag: 'close-alert',
      });
    }, delay);
  }
});

// Notification click: open app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('./index.html');
    })
  );
});
