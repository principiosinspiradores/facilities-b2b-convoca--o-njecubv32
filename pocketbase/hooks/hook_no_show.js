// pocketbase/hooks/hook_no_show.js
onRecordUpdate((e) => {
  e.next()

  const record = e.record
  const originalStatus = e.record.original().getString('status')
  const newStatus = record.getString('status')

  // Disparar quando escala ou convocação for marcada como 'falta'
  if (originalStatus !== 'falta' && newStatus === 'falta') {
    const escalaId = record.getString('escala')
    const proId = record.getString('pro')

    // 1. Buscar valor da multa em settings
    let valorMulta = 50
    try {
      const settingsList = $app.findRecordsByFilter('settings', 'id != ""', '-created', 1, 0)
      if (settingsList && settingsList.length > 0) {
        valorMulta = settingsList[0].getFloat('multa_falta_pro') || 50
      }
    } catch (_) {}

    // 2. Marcar multa_aplicada na escala
    try {
      const escala = $app.findRecordById('escalas', escalaId)
      escala.set('status', 'falta')
      escala.set('multa_aplicada', true)
      $app.save(escala)
    } catch (err) {
      console.log('Erro ao atualizar escala em no-show:', err)
    }

    // 3. Cancelar payout retido (se existir)
    try {
      const payouts = $app.findRecordsByFilter(
        'payouts',
        "escala = '" + escalaId + "' && pro = '" + proId + "'",
        '-created',
        1,
        0,
      )
      if (payouts && payouts.length > 0) {
        const pay = payouts[0]
        pay.set('status', 'cancelado')
        $app.save(pay)

        // Log evento multa_falta
        const eventsCol = $app.findCollectionByNameOrId('payment_events')
        const ev = new Record(eventsCol)
        ev.set('payout', pay.id)
        ev.set('tipo', 'multa_falta')
        ev.set('valor', -valorMulta)
        ev.set('data', new Date().toISOString())
        ev.set('metadata', {
          motivo: 'Falta do profissional ao turno (no-show)',
          escala_id: escalaId,
          pro_id: proId,
          valor_multa: valorMulta,
        })
        $app.save(ev)
      }
    } catch (err) {
      console.log('Erro ao processar payout em no-show:', err)
    }

    // 4. Auto-reofertar o turno: criar convocações para outros pros elegíveis
    try {
      const escala = $app.findRecordById('escalas', escalaId)
      const posto = $app.findRecordById('postos', escala.getString('posto'))
      const funcaoPosto = posto.getString('funcao')

      // Buscar pros com status ativo ou teste
      const pros = $app.findRecordsByFilter(
        'users',
        "role = 'pro' && (status = 'ativo' || status = 'teste') && id != '" + proId + "'",
        '-created',
        10,
        0,
      )

      const convCol = $app.findCollectionByNameOrId('convocacoes')
      const now = new Date()

      for (let i = 0; i < pros.length; i++) {
        const p = pros[i]
        // Verificar se não tem bloqueio ativo
        const bloqueadoAte = p.getString('bloqueado_ate')
        if (bloqueadoAte) {
          const dtBloq = new Date(bloqueadoAte)
          if (dtBloq.getTime() > now.getTime()) {
            continue
          }
        }

        // Verificar se já tem convocação para essa escala
        const existing = $app.findRecordsByFilter(
          'convocacoes',
          "escala = '" + escalaId + "' && pro = '" + p.id + "'",
          '-created',
          1,
          0,
        )
        if (existing && existing.length > 0) {
          continue
        }

        const newConv = new Record(convCol)
        newConv.set('escala', escalaId)
        newConv.set('pro', p.id)
        newConv.set('status', 'pendente')
        newConv.set('valor_diaria', escala.getFloat('valor_diaria') || 180)
        newConv.set('regra_aplicada', 'reoferta automática (substituição no-show)')
        newConv.set('data_convocacao', now.toISOString())
        $app.save(newConv)
      }

      // Atualiza escala para 'convocada'
      escala.set('status', 'convocada')
      $app.save(escala)
    } catch (err) {
      console.log('Erro ao reofertar turno no-show:', err)
    }
  }
}, 'convocacoes')
