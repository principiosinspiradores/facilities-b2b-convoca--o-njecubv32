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

    // 0. Ler parâmetros dinâmicos de settings (espelhando Profreela)
    let horasBloqueio = 24
    let limiteReincidencia = 2
    let valorMultaCancelamento = 0
    try {
      const settingsList = $app.findRecordsByFilter('settings', 'id != ""', '-created', 1, 0)
      if (settingsList && settingsList.length > 0) {
        const s = settingsList[0]
        horasBloqueio = s.getInt('horas_bloqueio_cancelamento') || 24
        limiteReincidencia = s.getInt('limite_reincidencia_suspensao') || 2
        valorMultaCancelamento = s.getFloat('multa_cancelamento_pro') || 0
      }
    } catch (_) {}

    // 1. Reabrir a escala (status 'aberta')
    try {
      const escala = $app.findRecordById('escalas', escalaId)
      escala.set('status', 'aberta')
      $app.save(escala)
    } catch (err) {
      console.log('Erro ao reabrir escala:', err)
    }

    // 2. Bloqueio dinâmico (horas_bloqueio) para o Pro + verificação de reincidência
    try {
      const pro = $app.findRecordById('users', proId)
      const bloqDate = new Date(now.getTime() + horasBloqueio * 60 * 60 * 1000)
      pro.set('bloqueado_ate', bloqDate.toISOString())

      // Contar cancelamentos anteriores deste pro
      const cancelamentos = $app.findRecordsByFilter(
        'convocacoes',
        "pro = '" + proId + "' && status = 'cancelada'",
        '-created',
        20,
        0,
      )

      // Se tiver atingido o limite configurável de reincidência, suspende
      if (cancelamentos && cancelamentos.length >= limiteReincidencia) {
        pro.set('status', 'suspenso')
      }

      $app.save(pro)
    } catch (err) {
      console.log('Erro ao aplicar bloqueio/suspensão ao pro:', err)
    }

    // 3. Cancelar payout retido associado + registrar evento de multa se configurada
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
        ev.set('valor', -valorMultaCancelamento)
        ev.set('data', now.toISOString())
        ev.set('metadata', {
          motivo: 'Cancelamento de turno previamente aceito pelo profissional',
          escala_id: escalaId,
          pro_id: proId,
          multa_aplicada: valorMultaCancelamento,
          horas_bloqueio: horasBloqueio,
          limite_reincidencia: limiteReincidencia,
        })
        $app.save(ev)
      }
    } catch (err) {
      console.log('Erro ao cancelar payout no hook_cancelar_pro:', err)
    }
  }
}, 'convocacoes')
