// YDS Hazırlık — Service Worker
// Uygulamayı önbelleğe alır, internet olmadan da çalışmasını sağlar

const CACHE_NAME = 'yds-hazirlik-v4';
const ASSETS = [
  '/',
  '/index.html'
];

// Kurulum: dosyaları önbelleğe al
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Aktivasyon: eski önbellekleri temizle
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: önce önbellekten dene, yoksa internetten al ve kaydet
self.addEventListener('fetch', event => {
  // Sadece GET isteklerini yakala
  if (event.request.method !== 'GET') return;

  // Harici API isteklerini (sözlük) doğrudan geçir — önbellekleme
  if (event.request.url.includes('dictionaryapi.dev')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(
        JSON.stringify([{word:'offline',meanings:[{partOfSpeech:'',definitions:[{definition:'İnternet bağlantısı yok. Uygulama offline çalışıyor.'}]}]}]),
        {headers:{'Content-Type':'application/json'}}
      ))
    );
    return;
  }

  // HTML istekleri için network-first: her zaman güncel versiyonu getir
  const isHTML = event.request.url.endsWith('.html') ||
                 event.request.url === location.origin + '/' ||
                 event.request.url === location.origin;

  if (isHTML) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request).then(c => c || new Response('Offline', {status: 503})))
    );
    return;
  }

  // Diğer dosyalar (JS, CSS, font): önce cache, yoksa network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => new Response('Offline', {status: 503}));
    })
  );
});

// Bildirime tıklanınca uygulamayı öne getir
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({type: 'window', includeUncontrolled: true}).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
