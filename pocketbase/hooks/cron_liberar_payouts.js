// pocketbase/hooks/cron_liberar_payouts.js
cronAdd('liberar_payouts_escrow', '*/10 * * * *', () => {
  const now = new Date()
  const nowIso = now.toISOString()

  // Buscar payouts status=retido, disputa_aberta=false, data_liberacao <= agora
  try {
    const payouts = $app.findRecordsByFilter(
      'payouts',
      "status = 'retido' && disputa_aberta = false && data_liberacao <= '" + nowIso + "'",
      'created',
      100,
      0,
    )

    if (!payouts || payouts.length === 0) {
      return
    }

    const eventsCol = $app.findCollectionByNameOrId('payment_events')

    for (let i = 0; i < payouts.length; i++) {
      const pay = payouts[i]
      const proId = pay.getString('pro')

      try {
        // Validação da Conta Pix do Profissional:
        // O pro precisa ter uma conta cadastrada E marcada como liberada (liberada = true)
        // Se não tiver conta liberada, o repasse fica retido até que a conta seja validada/liberada.
        let contaLiberada = false
        try {
          const contas = $app.findRecordsByFilter(
            'conta_pix',
            "pro = '" + proId + "' && liberada = true",
            '-created',
            1,
            0,
          )
          if (contas && contas.length > 0) {
            contaLiberada = true
          }
        } catch (_) {}

        if (!contaLiberada) {
          // Registra uma notificação/log no payment_events e pula a liberação deste payout
          const evRetido = new Record(eventsCol)
          evRetido.set('payout', pay.id)
          evRetido.set('tipo', 'retencao_conta_pendente')
          evRetido.set('valor', pay.getFloat('valor'))
          evRetido.set('data', nowIso)
          evRetido.set('metadata', {
            motivo: 'Payout retido: profissional não possui conta Pix validada/liberada',
            pro_id: proId,
          })
          $app.save(evRetido)
          continue
        }

        pay.set('status', 'pago')
        $app.save(pay)

        const ev = new Record(eventsCol)
        ev.set('payout', pay.id)
        ev.set('tipo', 'payout_liberado')
        ev.set('valor', pay.getFloat('valor'))
        ev.set('data', nowIso)
        ev.set('metadata', {
          motivo: 'Cron de liberação após período de garantia sem disputa aberta',
          data_liberacao: pay.getString('data_liberacao'),
          provedor: pay.getString('provedor'),
          conta_validada: true,
        })
        $app.save(ev)
      } catch (errRecord) {
        console.log('Erro ao liberar payout individual ' + pay.id + ':', errRecord)
      }
    }
  } catch (err) {
    console.log('Erro geral no cron liberar_payouts_escrow:', err)
  }
})
