// pocketbase/hooks/hook_ponto_push_atraso.js
// Dispara notificação push quando um ponto é registrado fora da janela (atraso) ou sincronizado com atraso relevante
// Destinatários: Usuários da empresa associada ao posto e administradores

onRecordAfterCreateSuccess((e) => {
  e.next()

  const record = e.record
  const tipo = record.getString('tipo')
  const foraJanela = record.getBool('fora_janela')
  const ocorrencia = record.getString('ocorrencia') || ''
  const atrasoSync = record.getInt('atraso_sincronizacao_minutos') || 0

  const isAtraso =
    foraJanela || ocorrencia.toLowerCase().indexOf('atrasad') >= 0 || atrasoSync >= 15
  if (!isAtraso) return

  try {
    const proId = record.getString('pro')
    const escalaId = record.getString('escala')

    let proNome = 'Profissional'
    try {
      const proUser = $app.findRecordById('users', proId)
      proNome = proUser.getString('name') || proUser.email() || 'Profissional'
    } catch (_) {}

    let postoNome = 'Posto'
    let dataEscala = ''
    try {
      if (escalaId) {
        const esc = $app.findRecordById('escalas', escalaId)
        dataEscala = esc.getString('data').slice(0, 10)
        const postoRec = $app.findRecordById('postos', esc.getString('posto'))
        postoNome = postoRec.getString('nome')
      }
    } catch (_) {}

    const pushTitle = 'Atraso registrado no ponto'
    let pushBody = `${proNome} registrou ${tipo === 'chegada' ? 'chegada' : 'saída'} com atraso no posto ${postoNome}.`
    if (ocorrencia) {
      pushBody += ` (${ocorrencia.slice(0, 60)})`
    }
    const pushUrl = '/conferencia-ponto'

    const gestores = $app.findRecordsByFilter(
      'users',
      "(role = 'empresa' || role = 'admin') && status = 'ativo'",
      '-created',
      20,
      0,
    )

    const VAPID = require(`${__hooks}/lib_vapid.js`)
    const pushTag = 'ponto-atraso-' + record.id
    for (let g = 0; g < gestores.length; g++) {
      const gestorId = gestores[g].id
      const subs = $app.findRecordsByFilter(
        'push_subscriptions',
        "user = '" + gestorId + "'",
        '-created',
        10,
        0,
      )
      for (let s = 0; s < subs.length; s++) {
        const sub = subs[s]
        const ep = sub.getString('endpoint')

        // 1. Gravar na fila push_outbox
        try {
          const outboxCol = $app.findCollectionByNameOrId('push_outbox')
          const outboxRec = new Record(outboxCol)
          outboxRec.set('user', gestorId)
          outboxRec.set('endpoint', ep)
          outboxRec.set('title', pushTitle)
          outboxRec.set('body', pushBody)
          outboxRec.set('url', pushUrl)
          outboxRec.set('tag', pushTag)
          outboxRec.set('lido', false)
          $app.save(outboxRec)
        } catch (outboxErr) {
          console.log('[PUSH] Erro ao gravar push_outbox de atraso no ponto:', outboxErr)
        }

        // 2. Disparo HTTP assinado com VAPID
        const pushRes = VAPID.sendPushNotification(
          ep,
          {
            title: pushTitle,
            body: pushBody,
            url: pushUrl,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: pushTag,
          },
          { urgency: 'normal', ttl: 86400 },
        )

        if (pushRes.success) {
          console.log(
            '[PUSH] Push de atraso no ponto entregue (HTTP ' +
              pushRes.statusCode +
              ') para sub ' +
              sub.id,
          )
        } else if (pushRes.expired) {
          console.log(
            '[PUSH] Subscrição expirada (HTTP ' +
              pushRes.statusCode +
              ') para sub ' +
              sub.id +
              '. Removendo.',
          )
          try {
            $app.delete(sub)
          } catch (_) {}
        } else {
          console.log(
            '[PUSH] Falha (status ' +
              pushRes.statusCode +
              ', erro: ' +
              (pushRes.error || pushRes.rawText || 'não especificado') +
              ') ao enviar push de atraso no ponto para sub ' +
              sub.id +
              ' [' +
              ep.slice(0, 40) +
              '...]',
          )
        }
      }
    }
  } catch (errGeral) {
    console.log('[PUSH] Erro geral no hook_ponto_push_atraso:', errGeral)
  }
}, 'pontos')
