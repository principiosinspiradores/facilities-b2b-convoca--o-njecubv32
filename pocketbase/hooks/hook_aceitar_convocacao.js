// pocketbase/hooks/hook_aceitar_convocacao.js
onRecordUpdate((e) => {
  e.next()

  const record = e.record
  const originalStatus = e.record.original().getString('status')
  const newStatus = record.getString('status')

  // Disparar apenas quando muda para 'aceita'
  if (originalStatus !== 'aceita' && newStatus === 'aceita') {
    const escalaId = record.getString('escala')
    const proId = record.getString('pro')
    const valorDiaria = record.getFloat('valor_diaria') || 0

    // 1. Atualizar status da escala para 'aceita'
    try {
      const escala = $app.findRecordById('escalas', escalaId)
      escala.set('status', 'aceita')
      $app.save(escala)
    } catch (err) {
      console.log('Erro ao atualizar escala para aceita:', err)
    }

    // 2. Buscar settings para período de garantia
    let guaranteeDays = 7
    let provider = 'mercadopago'
    try {
      const settingsList = $app.findRecordsByFilter('settings', 'id != ""', '-created', 1, 0)
      if (settingsList && settingsList.length > 0) {
        guaranteeDays = settingsList[0].getInt('guarantee_period_days') || 7
        provider = settingsList[0].getString('payout_provider') || 'mercadopago'
      }
    } catch (_) {}

    // 3. Criar ou atualizar payout status=retido (escrow contábil)
    let payoutRecord
    try {
      const payoutsCol = $app.findCollectionByNameOrId('payouts')
      payoutRecord = new Record(payoutsCol)
      payoutRecord.set('escala', escalaId)
      payoutRecord.set('pro', proId)
      payoutRecord.set('valor', valorDiaria)
      payoutRecord.set('status', 'retido')
      payoutRecord.set('disputa_aberta', false)

      const now = new Date()
      payoutRecord.set('data_conclusao', now.toISOString())

      const libDate = new Date(now.getTime() + guaranteeDays * 24 * 60 * 60 * 1000)
      payoutRecord.set('data_liberacao', libDate.toISOString())
      payoutRecord.set('provedor', provider)
      payoutRecord.set('referencia', 'ESC-' + escalaId.slice(0, 8))

      $app.save(payoutRecord)

      // 4. Log em payment_events
      const eventsCol = $app.findCollectionByNameOrId('payment_events')
      const event = new Record(eventsCol)
      event.set('payout', payoutRecord.id)
      event.set('tipo', 'convocacao_aceita')
      event.set('valor', valorDiaria)
      event.set('data', now.toISOString())
      event.set('metadata', {
        escala_id: escalaId,
        pro_id: proId,
        regra_aplicada: record.getString('regra_aplicada'),
        valor: valorDiaria,
      })
      $app.save(event)
    } catch (err) {
      console.log('Erro ao criar payout e evento:', err)
    }
  }
}, 'convocacoes')
