/**
 * Offline shell — network-first for app code so updates are not stuck on stale cache.
 * Bump CACHE_NAME after changing cached assets.
 */

const CACHE_NAME = 'sales-tracker-v4';

const PRECACHE = [
  './index.html',
  './style.css',
  './utils.js',
  './db.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

const APP_SHELL = new Set([
  'index.html',
  'style.css',
  'utils.js',
  'db.js',
  'app.js',
  'manifest.json'
]);

function isAppShellRequest(url) {
  const segments = url.pathname.split('/').filter(Boolean);
  const name = segments.length ? segments[segments.length - 1] : 'index.html';
  return APP_SHELL.has(name);
}

async function precacheAll(cache) {
  await Promise.all(
    PRECACHE.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (err) {
        console.warn('Precache skipped:', url, err);
      }
    })
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => precacheAll(cache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (isAppShellRequest(url)) {
    event.respondWith(networkFirstAppShell(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});

async function networkFirstAppShell(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match('./index.html');
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match('./index.html');
  }
}
