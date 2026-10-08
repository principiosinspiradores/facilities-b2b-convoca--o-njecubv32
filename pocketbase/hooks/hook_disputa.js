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

    // Notificação Push de Disputa aberta para os administradores
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
          try {
            const res = $http.send({
              url: ep,
              method: 'POST',
              headers: {
                TTL: '86400',
                Urgency: 'high',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                title: pushTitle,
                body: pushBody,
                url: pushUrl,
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                tag: 'disputa-aberta-' + record.id,
              }),
              timeout: 8,
            })
            if (res.statusCode === 404 || res.statusCode === 410) {
              $app.delete(sub)
            }
          } catch (errP) {
            console.log('[PUSH] Erro ao enviar push de disputa aberta:', errP)
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
