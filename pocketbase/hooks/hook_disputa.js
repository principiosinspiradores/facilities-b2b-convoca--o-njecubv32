// pocketbase/hooks/hook_disputa.js
// 1. Ao criar disputa (onRecordCreate)
onRecordCreate((e) => {
  e.next()

  const record = e.record
  const payoutId = record.getString('payout')
  const proId = record.getString('pro')
  const motivo = record.getString('motivo')

  try {
    const payout = $app.findRecordById('payouts', payoutId)
    payout.set('disputa_aberta', true)
    payout.set('status', 'disputa')
    $app.save(payout)

    const eventsCol = $app.findCollectionByNameOrId('payment_events')
    const ev = new Record(eventsCol)
    ev.set('payout', payoutId)
    ev.set('tipo', 'disputa_aberta')
    ev.set('valor', payout.getFloat('valor'))
    ev.set('data', new Date().toISOString())
    ev.set('metadata', {
      disputa_id: record.id,
      pro_id: proId,
      motivo: motivo,
    })
    $app.save(ev)

    // Notificação Push de Disputa aberta para os administradores via push_outbox e tickle
    try {
      let proNome = 'Profissional'
      try {
        const proUser = $app.findRecordById('users', proId)
        proNome = proUser.getString('name') || proUser.email() || 'Profissional'
      } catch (_) {}

      const admins = $app.findRecordsByFilter(
        'users',
        "role = 'admin' && status = 'ativo'",
        '-created',
        10,
        0,
      )

      const pushTitle = 'Disputa de escrow aberta'
      const pushBody = `Disputa aberta por ${proNome}: "${motivo.slice(0, 80)}". Requer mediação.`
      const pushUrl = '/disputas'
      const pushTag = 'disputa-aberta-' + record.id

      for (let a = 0; a < admins.length; a++) {
        const adminId = admins[a].id
        const subs = $app.findRecordsByFilter(
          'push_subscriptions',
          "user = '" + adminId + "'",
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
            outboxRec.set('user', adminId)
            outboxRec.set('endpoint', ep)
            outboxRec.set('title', pushTitle)
            outboxRec.set('body', pushBody)
            outboxRec.set('url', pushUrl)
            outboxRec.set('tag', pushTag)
            outboxRec.set('lido', false)
            $app.save(outboxRec)
          } catch (outboxErr) {
            console.log('[PUSH] Erro ao gravar push_outbox de disputa:', outboxErr)
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
            { urgency: 'high', ttl: 86400 },
          )

          if (pushRes.success) {
            console.log(
              '[PUSH] Push de disputa entregue (HTTP ' +
                pushRes.statusCode +
                ') para admin sub ' +
                sub.id,
            )
          } else if (pushRes.expired) {
            console.log(
              '[PUSH] Subscrição admin expirada (HTTP ' +
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
                ') ao enviar push de disputa para admin sub ' +
                sub.id +
                ' [' +
                ep.slice(0, 40) +
                '...]',
            )
          }
        }
      }
    } catch (errPushDisputa) {
      console.log('[PUSH] Erro ao enviar push de disputa aos admins:', errPushDisputa)
    }
  } catch (err) {
    console.log('Erro ao processar criação de disputa:', err)
  }
}, 'disputas')

// 2. Ao resolver disputa (onRecordUpdate)
onRecordUpdate((e) => {
  e.next()

  const record = e.record
  const originalRes = e.record.original().getString('resolucao')
  const newRes = record.getString('resolucao')

  if (originalRes === 'pendente' && newRes !== 'pendente') {
    const payoutId = record.getString('payout')
    const now = new Date()

    try {
      const payout = $app.findRecordById('payouts', payoutId)
      payout.set('disputa_aberta', false)

      if (newRes === 'a_favor_pro') {
        // Disputa favorável ao pro: libera o payout para pago
        payout.set('status', 'pago')
      } else if (newRes === 'a_favor_empresa') {
        // Disputa favorável à empresa: cancela payout
        payout.set('status', 'cancelado')
      }
      $app.save(payout)

      // Registrar resolução
      record.set('data_resolucao', now.toISOString())
      $app.save(record)

      const eventsCol = $app.findCollectionByNameOrId('payment_events')
      const ev = new Record(eventsCol)
      ev.set('payout', payoutId)
      ev.set('tipo', 'disputa_resolvida')
      ev.set('valor', payout.getFloat('valor'))
      ev.set('data', now.toISOString())
      ev.set('metadata', {
        disputa_id: record.id,
        resolucao: newRes,
        status_resultante: payout.getString('status'),
      })
      $app.save(ev)
    } catch (err) {
      console.log('Erro ao processar resolução de disputa:', err)
    }
  }
}, 'disputas')
