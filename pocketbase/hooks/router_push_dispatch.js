// pocketbase/hooks/router_push_dispatch.js
// Endpoint interno para obter configuração de VAPID e testar/disparar push diretamente

// Obter chave VAPID pública
routerAdd('GET', '/backend/v1/push/vapid-public-key', (e) => {
  const pubKey = $os.getenv('VAPID_PUBLIC_KEY')
  if (!pubKey) {
    return e.json(503, {
      error: 'VAPID_NOT_CONFIGURED',
      message:
        'Chave pública VAPID não configurada no servidor. Cadastre o secret VAPID_PUBLIC_KEY.',
    })
  }

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

    // 2. Disparar Web Push assinado com VAPID (com payload e tickle fallback)
    const result = VAPID.sendPushNotification(
      endpoint,
      {
        title: title,
        body: body,
        url: url,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'teste-' + outboxId,
      },
      { urgency: 'high', ttl: 86400 },
    )

    if (result.success) {
      enviados++
      console.log('[PUSH_TEST] Sucesso (HTTP ' + result.statusCode + ') para sub ' + sub.id)
    } else if (result.expired) {
      removidos++
      console.log(
        '[PUSH_TEST] Subscription expirada (HTTP ' +
          result.statusCode +
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
        '[PUSH_TEST] Falha (status ' +
          result.statusCode +
          ', erro: ' +
          (result.error || result.rawText || 'não especificado') +
          ') ao enviar push para sub ' +
          sub.id +
          ' [' +
          endpoint.slice(0, 40) +
          '...]',
      )
    }
  }

  return e.json(200, {
    totalSubscricoes: subscriptions.length,
    enviados: enviados,
    removidos: removidos,
    erros: erros,
  })
})
