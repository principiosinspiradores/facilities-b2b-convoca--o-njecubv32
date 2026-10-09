// pocketbase/migrations/0042_executar_validacao_servidor_real.js
migrate(
  (app) => {
    const authUrl =
      'https://facilities-b2b-convocacao-ae810.shrd00.internal.goskip.dev/api/collections/users/auth-with-password'

    const authRes = $http.send({
      url: authUrl,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identity: 'test_vapid_admin@facilitiespro.com.br',
        password: 'TestPass123456!',
      }),
      timeout: 15,
    })

    if (authRes.statusCode !== 200) {
      throw new Error(
        'Falha auth test_vapid_admin: status=' + authRes.statusCode + ' ' + authRes.rawText,
      )
    }

    const authData = JSON.parse(authRes.rawText)
    const token = authData.token

    const targetUrl =
      'https://facilities-b2b-convocacao-ae810.shrd00.internal.goskip.dev/backend/v1/push/gerar-vapid'

    // Chamada 1: POST /backend/v1/push/gerar-vapid com force=true
    const res1 = $http.send({
      url: targetUrl,
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ force: true }),
      timeout: 15,
    })

    if (res1.statusCode !== 200) {
      throw new Error(
        'Chamada 1 gerar-vapid falhou: status=' + res1.statusCode + ' body=' + res1.rawText,
      )
    }

    // Chamada 2: Segunda chamada sem force -> Deve retornar 409 "chaves já existentes"
    const res2 = $http.send({
      url: targetUrl,
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ force: false }),
      timeout: 15,
    })

    if (res2.statusCode !== 409) {
      throw new Error(
        'Chamada 2 sem force esperava 409, recebeu status=' +
          res2.statusCode +
          ' body=' +
          res2.rawText,
      )
    }

    // Chamada 3: POST /backend/v1/push/test (com sessão admin)
    // Criar uma inscrição de teste para o testAdmin se não houver
    const testSubCol = app.findCollectionByNameOrId('push_subscriptions')
    const testSub = new Record(testSubCol)
    testSub.set('user', authData.record.id)
    testSub.set(
      'endpoint',
      'https://fcm.googleapis.com/fcm/send/fake-test-endpoint-facilities-' + Date.now(),
    )
    testSub.set(
      'keys_p256dh',
      'BL8Hiv9V2RQ3OVggmeRxgau4biNzRLG4hc1XK0XX04qwOsDwpVJ7ubqG4EMioCc8-AOX0qlcuz1uYDPgLChZBh4',
    )
    testSub.set('keys_auth', '-K2ZIbCmOax68FAdjM6VQw')
    app.save(testSub)

    const testUrl =
      'https://facilities-b2b-convocacao-ae810.shrd00.internal.goskip.dev/backend/v1/push/test'
    const res3 = $http.send({
      url: testUrl,
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
      timeout: 15,
    })

    if (res3.statusCode !== 200) {
      throw new Error(
        'Chamada 3 push/test falhou com status=' + res3.statusCode + ' body=' + res3.rawText,
      )
    }

    // Remover a subscrição fake de teste
    try {
      app.delete(testSub)
    } catch (_) {}

    // Remover o usuário temporário de teste
    try {
      const u = app.findRecordById('users', authData.record.id)
      app.delete(u)
    } catch (_) {}
  },
  (app) => {},
)
