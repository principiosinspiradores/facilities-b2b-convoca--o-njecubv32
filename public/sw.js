// Service worker para PWA Facilities B2B com cache e suporte a Notificações Push
// Não interfere com requisições de API nem quebra ambiente de dev/preview

const CACHE_NAME = 'facilities-pwa-v2'
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
    url.pathname.startsWith('/backend/') ||
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

// ==========================================
// 🔔 GESTÃO DE NOTIFICAÇÕES PUSH (WEB PUSH)
// ==========================================

self.addEventListener('push', (event) => {
  let data = {}
  try {
    if (event.data) {
      data = event.data.json()
    }
  } catch (_) {
    // Se o payload vier como texto simples
    data = {
      title: 'Facilities B2B',
      body: event.data ? event.data.text() : 'Nova notificação do sistema',
    }
  }

  const title = data.title || 'Facilities B2B'
  const options = {
    body: data.body || 'Você possui uma nova atualização.',
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    tag: data.tag || 'facilities-notification',
    data: {
      url: data.url || '/',
      timestamp: Date.now(),
    },
    vibrate: [100, 50, 100],
    requireInteraction: true,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// Clique na notificação: abre o app ou foca na aba/tela correta
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url || '/'
  const absoluteUrl = new URL(targetUrl, self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se houver uma janela aberta do mesmo domínio, foca nela e navega para a URL
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.url === absoluteUrl) {
            return client.focus()
          }
          if ('navigate' in client) {
            client.navigate(absoluteUrl)
            return client.focus()
          }
        }
      }
      // Se o app estiver fechado, abre uma nova janela na URL de destino
      if (self.clients.openWindow) {
        return self.clients.openWindow(absoluteUrl)
      }
    }),
  )
})
