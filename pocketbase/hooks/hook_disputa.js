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
