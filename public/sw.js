// Service worker leve para PWA com estratégia network-first
// Não interfere com requisições de API nem quebra ambiente de dev/preview

const CACHE_NAME = 'facilities-pwa-v1'
const PRECACHE_ASSETS = ['/', '/index.html', '/manifest.json', '/favicon.ico']

// Instalação: pré-cache do shell mínimo
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Aviso no precache:', err)
      })
    }),
  )
  self.skipWaiting()
})

// Ativação: limpar caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key)
          }
        }),
      )
    }),
  )
  self.clients.claim()
})

// Fetch: estratégia Network-First para App Shell e estáticos, NUNCA interceptar PocketBase API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Ignorar chamadas da API do PocketBase, WebSockets e requisições não-GET
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('/realtime') ||
    url.origin.includes('internal.goskip.dev') ||
    url.origin.includes('goskip.dev')
  ) {
    return
  }

  // Network-first com fallback para cache
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Se a resposta for válida e for do mesmo domínio, guarda uma cópia no cache
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic' &&
          !url.pathname.startsWith('/@')
        ) {
          const responseToCache = networkResponse.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache).catch(() => {})
          })
        }
        return networkResponse
      })
      .catch(async () => {
        // Sem rede: tenta responder com o cache
        const cachedResponse = await caches.match(event.request)
        if (cachedResponse) {
          return cachedResponse
        }
        // Se for navegação de página HTML e estiver offline, retorna o index.html em cache (SPA fallback)
        if (event.request.mode === 'navigate') {
          const indexFallback = await caches.match('/index.html')
          if (indexFallback) return indexFallback
        }
        return new Response('Offline: sem conexão de rede.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      }),
  )
})
