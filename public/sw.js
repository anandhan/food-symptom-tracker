// Service Worker for PWA

const CACHE_NAME = 'food-tracker-v2';
const urlsToCache = [
  '/',
  '/login',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

const OCR_ASSETS = [
  '/ocr/worker.min.js',
  '/ocr/tesseract-core-simd-lstm.wasm.js',
  '/ocr/tesseract-core-simd-lstm.wasm',
  '/ocr/tesseract-core-lstm.wasm.js',
  '/ocr/tesseract-core-lstm.wasm',
  '/ocr/eng.traineddata.gz',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(urlsToCache);
      await Promise.all(
        OCR_ASSETS.map((url) => cache.add(url).catch(() => undefined))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/ocr/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) {
          cache.put(event.request, response.clone());
        }
        return response;
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
