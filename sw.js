const CACHE_NAME = 'neon-arcade-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/common.js',
  '/manifest.json',
  '/icons/icon.svg',
  '/js/virtual-joystick.js',
  '/tetris/',
  '/tetris/index.html',
  '/tetris/tetris.css',
  '/tetris/tetris.js',
  '/pac-man/',
  '/pac-man/index.html',
  '/pac-man/pac-man.css',
  '/pac-man/pac-man.js',
  '/space-invaders/',
  '/space-invaders/index.html',
  '/space-invaders/space-invaders.css',
  '/space-invaders/space-invaders.js',
  '/snake/',
  '/snake/index.html',
  '/snake/snake.css',
  '/snake/snake.js',
  '/xonix/',
  '/xonix/index.html',
  '/xonix/xonix.css',
  '/xonix/xonix.js',
  '/berzerk/',
  '/berzerk/index.html',
  '/berzerk/berzerk.css',
  '/berzerk/berzerk.js',
  '/lode-runner/',
  '/lode-runner/index.html',
  '/lode-runner/lode-runner.css',
  '/lode-runner/lode-runner-levels.js',
  '/lode-runner/lode-runner.js',
  '/paratrooper/',
  '/paratrooper/index.html',
  '/paratrooper/paratrooper.css',
  '/paratrooper/paratrooper.js',
  '/highway/',
  '/highway/index.html',
  '/highway/highway.css',
  '/highway/highway.js',
  '/arkanoid/',
  '/arkanoid/index.html',
  '/arkanoid/arkanoid.css',
  '/arkanoid/arkanoid.js',
  '/arkanoid/og-image.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
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
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      }).catch(() => {
        // Offline fallback
      });
    })
  );
});
