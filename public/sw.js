// Service worker para PWA Facilities B2B com cache versionado e suporte a Notificações Push
// Suporta push com payload (quando entregue) e modo tickle (push sem payload com busca na push_outbox)

// Versão do app e nome do cache derivado da release para evitar index.html/chunks obsoletos após redeploy
const APP_VERSION = '0.0.62'
const CACHE_NAME = `facilities-pwa-v${APP_VERSION}`
const PRECACHE_ASSETS = ['/', '/index.html', '/manifest.json', '/favicon.ico']

// Instalação: pré-cache do shell mínimo e ativação imediata
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

// Ativação: limpar caches antigos de versões anteriores e assumir o controle dos clientes
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key.startsWith('facilities-pwa-')) {
            console.log('[SW] Purgando cache legado:', key)
            return caches.delete(key)
          }
        }),
      )
    }),
  )
  self.clients.claim()
})

// Fetch: estratégia Network-First estrita para App Shell e estáticos, NUNCA interceptar PocketBase API
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

  // Verifica se é requisição para chunk JS/CSS compilado (ex: /assets/index-xxx.js)
  const isHashedAsset = url.pathname.startsWith('/assets/') || /\.(js|css|mjs)$/i.test(url.pathname)

  // Network-first com fallback para cache e tratamento especial de 404 em chunks desatualizados
  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then(async (networkResponse) => {
        // Se a resposta for 404 para um chunk com hash antigo após um novo deploy:
        // O build anterior foi substituído no servidor. Se o cache antigo do chunk ou index
        // causou 404, purgamos referências do cache e nunca armazenamos erro 404.
        if (networkResponse.status === 404 && isHashedAsset) {
          console.warn('[SW] Chunk com hash antigo não encontrado no servidor (404):', url.pathname)
          // Remove entrada obsoleta se existia no cache
          const cache = await caches.open(CACHE_NAME)
          await cache.delete(event.request)
          // Retorna a resposta de rede (o handler global de erro no cliente dispara reload se chunk falhar)
          return networkResponse
        }

        // Se a resposta for válida (200 OK) e for do mesmo domínio, guarda uma cópia no cache versionado
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
        // Sem rede: tenta responder com o cache versionado atual
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

async function fetchPendingNotification(endpoint) {
  try {
    const res = await fetch(
      '/backend/v1/push/pending-notification?endpoint=' + encodeURIComponent(endpoint),
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
    )
    if (res.ok) {
      const data = await res.json()
      if (data && data.notification) {
        return data.notification
      }
    }
  } catch (err) {
    console.warn('[SW] Erro ao buscar notificação pendente no tickle:', err)
  }
  return null
}

self.addEventListener('push', (event) => {
  const promiseChain = (async () => {
    let payload = null

    // 1. Verificar se veio payload embutido no evento
    if (event.data) {
      try {
        payload = event.data.json()
      } catch (_) {
        const text = event.data.text()
        if (text && text.trim().length > 0) {
          payload = {
            title: 'Facilities B2B',
            body: text,
          }
        }
      }
    }

    // 2. Se não veio dados (push tickle sem payload), buscar da fila push_outbox via endpoint
    if (!payload || !payload.title) {
      let endpoint = ''
      try {
        const sub = await self.registration.pushManager.getSubscription()
        if (sub && sub.endpoint) {
          endpoint = sub.endpoint
        }
      } catch (subErr) {
        console.warn('[SW] Falha ao obter subscription:', subErr)
      }

      if (endpoint) {
        const pending = await fetchPendingNotification(endpoint)
        if (pending) {
          payload = {
            title: pending.title,
            body: pending.body,
            url: pending.url || '/',
            tag: pending.tag || pending.id || 'facilities-tickle',
          }
        }
      }
    }

    // Fallback padrão se ainda assim não tiver payload
    const title = (payload && payload.title) || 'Facilities B2B'
    const body =
      (payload && payload.body) ||
      'Você possui uma nova atualização. Abra o aplicativo para conferir.'
    const targetUrl = (payload && payload.url) || '/'
    const tag = (payload && payload.tag) || 'facilities-notification'

    const options = {
      body: body,
      icon: (payload && payload.icon) || '/favicon.ico',
      badge: (payload && payload.badge) || '/favicon.ico',
      tag: tag,
      data: {
        url: targetUrl,
        timestamp: Date.now(),
      },
      vibrate: [100, 50, 100],
      requireInteraction: true,
    }

    return self.registration.showNotification(title, options)
  })()

  event.waitUntil(promiseChain)
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
