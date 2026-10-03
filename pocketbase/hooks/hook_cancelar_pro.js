// pocketbase/hooks/hook_cancelar_pro.js
onRecordUpdate((e) => {
  e.next()

  const record = e.record
  const originalStatus = e.record.original().getString('status')
  const newStatus = record.getString('status')

  // Disparar quando pro cancela convocação que já estava 'aceita'
  if (originalStatus === 'aceita' && (newStatus === 'cancelada' || newStatus === 'recusada')) {
    const escalaId = record.getString('escala')
    const proId = record.getString('pro')

    const now = new Date()

    // 1. Reabrir a escala (status 'aberta')
    try {
      const escala = $app.findRecordById('escalas', escalaId)
      escala.set('status', 'aberta')
      $app.save(escala)
    } catch (err) {
      console.log('Erro ao reabrir escala:', err)
    }

    // 2. Bloqueio de 24h para o Pro + verificação de reincidência
    try {
      const pro = $app.findRecordById('users', proId)
      const bloqDate = new Date(now.getTime() + 24 * 60 * 60 * 1000)
      pro.set('bloqueado_ate', bloqDate.toISOString())

      // Contar cancelamentos anteriores deste pro
      const cancelamentos = $app.findRecordsByFilter(
        'convocacoes',
        "pro = '" + proId + "' && status = 'cancelada'",
        '-created',
        10,
        0,
      )

      // Se tiver mais de 2 cancelamentos acumulados, suspende
      if (cancelamentos && cancelamentos.length >= 2) {
        pro.set('status', 'suspenso')
      }

      $app.save(pro)
    } catch (err) {
      console.log('Erro ao aplicar bloqueio/suspensão ao pro:', err)
    }

    // 3. Cancelar payout retido associado
    try {
      const payouts = $app.findRecordsByFilter(
        'payouts',
        "escala = '" + escalaId + "' && pro = '" + proId + "' && status = 'retido'",
        '-created',
        1,
        0,
      )
      if (payouts && payouts.length > 0) {
        const pay = payouts[0]
        pay.set('status', 'cancelado')
        $app.save(pay)

        const eventsCol = $app.findCollectionByNameOrId('payment_events')
        const ev = new Record(eventsCol)
        ev.set('payout', pay.id)
        ev.set('tipo', 'cancelamento_pro')
        ev.set('valor', 0)
        ev.set('data', now.toISOString())
        ev.set('metadata', {
          motivo: 'Cancelamento de turno previamente aceito pelo profissional',
          escala_id: escalaId,
          pro_id: proId,
        })
        $app.save(ev)
      }
    } catch (err) {
      console.log('Erro ao cancelar payout no hook_cancelar_pro:', err)
    }
  }
}, 'convocacoes')
