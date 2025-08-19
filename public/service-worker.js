const SW_VERSION = 'v3'; // Bumped for cache bypass fix

// Disable SW in localhost development
if (self?.location?.hostname === 'localhost') {
  self.registration.unregister()
    .then(() => console.log('[SW] Unregistered on localhost'))
    .catch(err => console.warn('[SW] Failed to unregister:', err));
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Bypass caching for chat API endpoints to prevent stream interference
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Skip caching for streaming endpoints with explicit fetch
  if (url.pathname === '/api/chat' || url.pathname.startsWith('/api/chat/')) {
    event.respondWith(
      fetch(event.request, { 
        cache: 'no-store',
        headers: {
          ...Object.fromEntries(event.request.headers),
          'Cache-Control': 'no-cache'
        }
      })
    );
    return;
  }
  
  // For all other requests, use default browser behavior
});