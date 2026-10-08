// pocketbase/hooks/router_push_dispatch.js
// Endpoint interno para obter configuração de VAPID e testar/disparar push diretamente

routerAdd('GET', '/backend/v1/push/vapid-public-key', (e) => {
  const pubKey =
    $os.getenv('VAPID_PUBLIC_KEY') ||
    'BN8vQj4x5m3nL8yR1wK6vP9zT2uO7qS5jA3dM8eX2yL9zB4cV7nP1mO6rT8uE3yL9zB4cV7nP1mO6rT8uE3yL9w'

  return e.json(200, {
    publicKey: pubKey,
  })
})

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

  for (let i = 0; i < subscriptions.length; i++) {
    const sub = subscriptions[i]
    const endpoint = sub.getString('endpoint')

    try {
      const resp = $http.send({
        url: endpoint,
        method: 'POST',
        headers: {
          TTL: '86400',
          Urgency: 'normal',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title,
          body: body,
          url: url,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
        }),
        timeout: 10,
      })

      if (resp.statusCode === 404 || resp.statusCode === 410) {
        $app.delete(sub)
        removidos++
      } else {
        enviados++
      }
    } catch (httpErr) {
      console.log('[PUSH_TEST] Erro no envio direto para subscription:', httpErr)
    }
  }

  return e.json(200, {
    totalSubscricoes: subscriptions.length,
    enviados: enviados,
    removidos: removidos,
  })
})
