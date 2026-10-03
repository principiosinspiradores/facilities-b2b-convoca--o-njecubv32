// pocketbase/hooks/hook_cancelar_pro.js
onRecordUpdate((e) => {
  e.next()

  const record = e.record
  const originalStatus = e.record.original().getString('status')
  const newStatus = record.getString('status')

  // Disparar quando pro cancela convocação que já estava 'aceita'
  // OU quando pro fixo recusa convocação direta
  const isCancelamentoAceito =
    originalStatus === 'aceita' && (newStatus === 'cancelada' || newStatus === 'recusada')
  const isRecusaDireta = originalStatus === 'pendente' && newStatus === 'recusada'

  if (isCancelamentoAceito || isRecusaDireta) {
    const escalaId = record.getString('escala')
    const proId = record.getString('pro')
    const now = new Date()

    let escala
    let posto
    try {
      escala = $app.findRecordById('escalas', escalaId)
      posto = $app.findRecordById('postos', escala.getString('posto'))
    } catch (_) {}

    const proFixoId = posto ? posto.getString('pro_fixo') : ''
    const isProFixo = proFixoId && proFixoId === proId

    // 0. Ler parâmetros dinâmicos de settings
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

    // 1. Se foi cancelamento após aceitar: aplicar bloqueio e suspensão por reincidência
    if (isCancelamentoAceito) {
      // Reabrir a escala (status 'aberta')
      if (escala) {
        try {
          escala.set('status', 'aberta')
          $app.save(escala)
        } catch (err) {
          console.log('Erro ao reabrir escala:', err)
        }
      }

      // Bloqueio dinâmico (horas_bloqueio) para o Pro + verificação de reincidência
      try {
        const pro = $app.findRecordById('users', proId)
        const bloqDate = new Date(now.getTime() + horasBloqueio * 60 * 60 * 1000)
        pro.set('bloqueado_ate', bloqDate.toISOString())

        const cancelamentos = $app.findRecordsByFilter(
          'convocacoes',
          "pro = '" + proId + "' && status = 'cancelada'",
          '-created',
          20,
          0,
        )

        if (cancelamentos && cancelamentos.length >= limiteReincidencia) {
          pro.set('status', 'suspenso')
        }

        $app.save(pro)
      } catch (err) {
        console.log('Erro ao aplicar bloqueio/suspensão ao pro:', err)
      }

      // Cancelar payout retido associado + registrar evento de multa se configurada
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

    // 2. Acionar reoferta automática para freelancers elegíveis se:
    // - Pro fixo recusou (isRecusaDireta && isProFixo)
    // - OU qualquer pro cancelou turno após ter aceito (isCancelamentoAceito)
    if ((isRecusaDireta && isProFixo) || isCancelamentoAceito) {
      try {
        if (!escala) escala = $app.findRecordById('escalas', escalaId)
        if (!posto) posto = $app.findRecordById('postos', escala.getString('posto'))

        const cargaHoraria = posto.getInt('carga_horaria') || 8

        let valorDiariaFreelancer = escala.getFloat('valor_diaria') || 0
        if (!valorDiariaFreelancer || valorDiariaFreelancer <= 0) {
          try {
            const baseRules = $app.findRecordsByFilter(
              'pricing_rules',
              "tipo = 'base'",
              'faixa_horas',
              50,
              0,
            )
            if (baseRules && baseRules.length > 0) {
              for (let b = 0; b < baseRules.length; b++) {
                if (baseRules[b].getInt('faixa_horas') === cargaHoraria) {
                  valorDiariaFreelancer = baseRules[b].getFloat('valor')
                  break
                }
              }
            }
          } catch (_) {}
          if (!valorDiariaFreelancer) valorDiariaFreelancer = 180
        }

        const pros = $app.findRecordsByFilter(
          'users',
          "role = 'pro' && (status = 'ativo' || status = 'teste') && id != '" + proId + "'",
          '-created',
          15,
          0,
        )

        const convCol = $app.findCollectionByNameOrId('convocacoes')
        let countReoferta = 0

        for (let i = 0; i < pros.length; i++) {
          const p = pros[i]
          const bloqueadoAte = p.getString('bloqueado_ate')
          if (bloqueadoAte) {
            const dtBloq = new Date(bloqueadoAte)
            if (dtBloq.getTime() > now.getTime()) {
              continue
            }
          }

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

          let proValor = valorDiariaFreelancer
          let regra = isProFixo
            ? 'reoferta automática (recusa da fixa do posto)'
            : 'reoferta automática (cancelamento do pro)'

          if (p.getString('status') === 'teste') {
            proValor = p.getFloat('ajuda_custo') || 50
            regra = 'reoferta (ajuda de custo - teste)'
          } else if (p.getFloat('valor_negociado') > 0) {
            proValor = p.getFloat('valor_negociado')
            regra = 'reoferta (valor negociado)'
          }

          const newConv = new Record(convCol)
          newConv.set('escala', escalaId)
          newConv.set('pro', p.id)
          newConv.set('status', 'pendente')
          newConv.set('valor_diaria', proValor)
          newConv.set('regra_aplicada', regra)
          newConv.set('data_convocacao', now.toISOString())
          $app.save(newConv)
          countReoferta++
        }

        if (countReoferta > 0) {
          escala.set('status', 'convocada')
          if (!escala.getFloat('valor_diaria')) {
            escala.set('valor_diaria', valorDiariaFreelancer)
          }
          $app.save(escala)
        }
      } catch (err) {
        console.log('Erro ao reofertar em cancelamento/recusa da fixa:', err)
      }
    }
  }
}, 'convocacoes')
