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
      try {
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
