// YDS Hazırlık — Service Worker
// Uygulamayı önbelleğe alır, internet olmadan da çalışmasını sağlar

const CACHE_NAME = 'yds-hazirlik-v2';
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

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Sadece başarılı HTML/JS/CSS yanıtlarını önbelleğe al
        if (
          response.ok &&
          (event.request.url.endsWith('.html') ||
           event.request.url.endsWith('.js') ||
           event.request.url.endsWith('.css') ||
           event.request.url === '/' ||
           event.request.url === location.origin + '/')
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached || new Response('Offline', {status: 503}));
    })
  );
});
