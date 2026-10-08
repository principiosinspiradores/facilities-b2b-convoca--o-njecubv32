// pocketbase/hooks/router_push_dispatch.js
// Endpoint interno para obter configuração de VAPID e testar/disparar push diretamente

// Obter chave VAPID pública
routerAdd('GET', '/backend/v1/push/vapid-public-key', (e) => {
  const pubKey =
    $os.getenv('VAPID_PUBLIC_KEY') ||
    'BN8vQj4x5m3nL8yR1wK6vP9zT2uO7qS5jA3dM8eX2yL9zB4cV7nP1mO6rT8uE3yL9zB4cV7nP1mO6rT8uE3yL9w'

  return e.json(200, {
    publicKey: pubKey,
  })
})

// Endpoint para o Service Worker buscar a notificação pendente (tickle push)
routerAdd('GET', '/backend/v1/push/pending-notification', (e) => {
  const endpoint = e.request.url.query().get('endpoint')
  if (!endpoint) {
    return e.json(400, { error: 'endpoint query param obrigatório' })
  }

  try {
    // Buscar a notificação não lida mais recente deste endpoint
    const outboxItems = $app.findRecordsByFilter(
      'push_outbox',
      "endpoint = '" + endpoint.replace(/'/g, "''") + "' && lido != true",
      '-created',
      1,
      0,
    )

    if (outboxItems && outboxItems.length > 0) {
      const item = outboxItems[0]
      item.set('lido', true)
      $app.save(item)

      return e.json(200, {
        notification: {
          id: item.id,
          title: item.getString('title'),
          body: item.getString('body'),
          url: item.getString('url') || '/',
          tag: item.getString('tag') || item.id,
          created: item.getString('created'),
        },
      })
    }
  } catch (err) {
    console.log('[PUSH_DISPATCH] Erro ao buscar notificação pendente:', err)
  }

  return e.json(200, { notification: null })
})

// Endpoint para testar o envio de push usando o mesmo mecanismo centralizado
routerAdd('POST', '/backend/v1/push/test', (e) => {
  const authRecord = e.auth
  if (!authRecord) {
    return e.json(401, { error: 'Não autorizado' })
  }

  const userId = authRecord.id
  let subscriptions = []
  try {
    subscriptions = $app.findRecordsByFilter(
      'push_subscriptions',
      "user = '" + userId + "'",
      '-created',
      20,
      0,
    )
  } catch (err) {
    return e.json(500, { error: 'Erro ao buscar inscrições: ' + err })
  }

  const title = 'Teste de Notificação Push'
  const body =
    'Seu dispositivo está configurado e pronto para receber notificações de convocações e alertas!'
  const url = '/convocacoes'

  let enviados = 0
  let removidos = 0
  let erros = 0

  for (let i = 0; i < subscriptions.length; i++) {
    const sub = subscriptions[i]
    const endpoint = sub.getString('endpoint')

    // 1. Salvar na fila push_outbox (modo tickle confiável)
    let outboxId = ''
    try {
      const outboxCol = $app.findCollectionByNameOrId('push_outbox')
      const outboxRec = new Record(outboxCol)
      outboxRec.set('user', userId)
      outboxRec.set('endpoint', endpoint)
      outboxRec.set('title', title)
      outboxRec.set('body', body)
      outboxRec.set('url', url)
      outboxRec.set('tag', 'teste-' + Date.now())
      outboxRec.set('lido', false)
      $app.save(outboxRec)
      outboxId = outboxRec.id
    } catch (outboxErr) {
      console.log('[PUSH_TEST] Erro ao salvar outbox:', outboxErr)
    }

    // 2. Disparar Web Push (com payload e tickle fallback)
    try {
      const resp = $http.send({
        url: endpoint,
        method: 'POST',
        headers: {
          TTL: '86400',
          Urgency: 'high',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title,
          body: body,
          url: url,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: 'teste-' + outboxId,
        }),
        timeout: 8,
      })

      const status = resp.statusCode
      const rawText = resp.rawText ? resp.rawText.slice(0, 160) : ''

      if (status >= 200 && status < 300) {
        enviados++
        console.log('[PUSH_TEST] Sucesso (HTTP ' + status + ') para sub ' + sub.id)
      } else if (status === 404 || status === 410) {
        removidos++
        console.log(
          '[PUSH_TEST] Subscription expirada (HTTP ' +
            status +
            ') para sub ' +
            sub.id +
            '. Removendo.',
        )
        try {
          $app.delete(sub)
        } catch (_) {}
      } else {
        erros++
        console.log(
          '[PUSH_TEST] Falha HTTP ' +
            status +
            ' ao enviar push para sub ' +
            sub.id +
            ' [' +
            endpoint.slice(0, 40) +
            '...]: ' +
            rawText,
        )
      }
    } catch (httpErr) {
      erros++
      console.log('[PUSH_TEST] Exceção de rede no envio para sub ' + sub.id + ':', httpErr)
    }
  }

  return e.json(200, {
    totalSubscricoes: subscriptions.length,
    enviados: enviados,
    removidos: removidos,
    erros: erros,
  })
})
