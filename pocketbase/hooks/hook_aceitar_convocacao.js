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
    let escala
    let posto
    try {
      escala = $app.findRecordById('escalas', escalaId)
      escala.set('status', 'aceita')
      $app.save(escala)

      posto = $app.findRecordById('postos', escala.getString('posto'))
    } catch (err) {
      console.log('Erro ao atualizar escala para aceita:', err)
    }

    // 2. Se a profissional for fixa do posto com remuneração MENSAL:
    // O valor dela NÃO entra no escrow por diária (é salário mensal contratado fora do escrow diário)
    let isFixaMensal = false
    if (posto) {
      const proFixoId = posto.getString('pro_fixo')
      const tipoRemun = posto.getString('tipo_remuneracao_fixa')
      if (proFixoId && proFixoId === proId && tipoRemun === 'mensal') {
        isFixaMensal = true
      }
    }

    // 3. Cancelar outras convocações pendentes para esta mesma escala
    // "Se o pro fixo aceitar, os demais pros elegíveis não recebem a convocação daquele dia."
    try {
      const outrasConvs = $app.findRecordsByFilter(
        'convocacoes',
        "escala = '" + escalaId + "' && id != '" + record.id + "' && status = 'pendente'",
        '-created',
        50,
        0,
      )
      for (let i = 0; i < outrasConvs.length; i++) {
        const c = outrasConvs[i]
        c.set('status', 'cancelada')
        $app.save(c)
      }
    } catch (err) {
      console.log('Erro ao cancelar outras convocações da mesma escala:', err)
    }

    // Se for fixa mensal, não gera payout em escrow de diária
    if (isFixaMensal) {
      console.log('Pro fixa mensal aceitou escala. Escrow por diária omitido conforme regra.')
      return
    }

    // 4. Buscar settings para período de garantia (Freelancers ou Fixa por Hora)
    let guaranteeDays = 7
    let provider = 'mercadopago'
    try {
      const settingsList = $app.findRecordsByFilter('settings', 'id != ""', '-created', 1, 0)
      if (settingsList && settingsList.length > 0) {
        guaranteeDays = settingsList[0].getInt('guarantee_period_days') || 7
        provider = settingsList[0].getString('payout_provider') || 'mercadopago'
      }
    } catch (_) {}

    // 5. Criar ou atualizar payout status=retido (escrow contábil)
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

      // 6. Log em payment_events
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
