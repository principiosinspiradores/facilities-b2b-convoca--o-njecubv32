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
      } else {
        // Mesmo sem payout de diária prévio (ex: pro fixa mensal), registrar a multa em payment_events para auditoria
        const eventsCol = $app.findCollectionByNameOrId('payment_events')
        const ev = new Record(eventsCol)
        ev.set('tipo', 'multa_falta')
        ev.set('valor', -valorMulta)
        ev.set('data', new Date().toISOString())
        ev.set('metadata', {
          motivo: 'Falta do profissional ao turno (no-show - pro fixo/mensal)',
          escala_id: escalaId,
          pro_id: proId,
          valor_multa: valorMulta,
        })
        $app.save(ev)
      }
    } catch (err) {
      console.log('Erro ao processar payout em no-show:', err)
    }

    // 4. Auto-reofertar o turno: se o pro fixo faltar ou qualquer outro pro faltar,
    // reofertar para os demais pros elegíveis freelancers pelo motor de diária normal
    try {
      const escala = $app.findRecordById('escalas', escalaId)
      const posto = $app.findRecordById('postos', escala.getString('posto'))
      const cargaHoraria = posto.getInt('carga_horaria') || 8

      // Buscar valor de diária padrão do motor para os freelancers
      let valorDiariaFreelancer = escala.getFloat('valor_diaria') || 180
      if (!valorDiariaFreelancer || valorDiariaFreelancer <= 0) {
        // Tentar calcular via regras base do posto/horas
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

      // Buscar pros com status ativo ou teste
      const pros = $app.findRecordsByFilter(
        'users',
        "role = 'pro' && (status = 'ativo' || status = 'teste') && id != '" + proId + "'",
        '-created',
        15,
        0,
      )

      const convCol = $app.findCollectionByNameOrId('convocacoes')
      const now = new Date()

      let convCreated = 0
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

        // Freelancers recebem pelo motor de diária (considerando teste ou negociado)
        let proValor = valorDiariaFreelancer
        let regra = 'reoferta automática (substituição no-show)'
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
        convCreated++

        // Disparar e-mail de aviso de falta com reoferta urgente
        try {
          const pEmail = p.email()
          if (pEmail) {
            let senderName = 'Facilities Pro'
            let senderEmail = 'noreply@facilitiespro.com.br'
            try {
              const sList = $app.findRecordsByFilter('settings', 'id != ""', '-created', 1, 0)
              if (sList && sList.length > 0) {
                senderName = sList[0].getString('nome_empresa') || senderName
                const empEmail = sList[0].getString('empresa_pix_chave')
                if (empEmail && empEmail.indexOf('@') > 0) {
                  senderEmail = empEmail
                }
              }
            } catch (_) {}

            const postoNome = posto ? posto.getString('nome') : 'Posto'
            const dataEscala = escala ? escala.getString('data').slice(0, 10) : ''
            const turnoInicio = escala ? escala.getString('turno_inicio') : ''
            const turnoFim = escala ? escala.getString('turno_fim') : ''

            const html = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <div style="background-color: #dc2626; color: #ffffff; padding: 16px; border-radius: 6px; text-align: center;">
                  <h2 style="margin: 0; font-size: 20px;">${senderName}</h2>
                  <p style="margin: 4px 0 0 0; font-size: 13px;">Ocorrência de Falta & Reoferta Urgente</p>
                </div>
                <div style="padding: 20px 0; color: #334155; font-size: 14px; line-height: 1.6;">
                  <p>Olá, <strong>${p.getString('name') || 'Profissional'}</strong>!</p>
                  <p>Houve uma ausência de profissional no posto abaixo e uma vaga emergencial foi aberta para substituição imediata:</p>
                  <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 12px; margin: 16px 0;">
                    <p style="margin: 0;"><strong>Posto:</strong> ${postoNome}</p>
                    <p style="margin: 4px 0 0 0;"><strong>Data:</strong> ${dataEscala}</p>
                    <p style="margin: 4px 0 0 0;"><strong>Horário:</strong> ${turnoInicio} às ${turnoFim}</p>
                    <p style="margin: 4px 0 0 0;"><strong>Remuneração Turno:</strong> R$ ${proValor.toFixed(2)} (${regra})</p>
                  </div>
                  <p style="font-size: 13px;">Acesse seu painel imediatamente para aceitar este turno de cobertura.</p>
                </div>
                <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; text-align: center;">
                  Enviado automaticamente por ${senderName}.
                </div>
              </div>
            `

            const mailer = new MailerMessage({
              from: { address: senderEmail, name: senderName },
              to: [{ address: pEmail }],
              subject: `[${senderName}] Falta / Vaga Emergencial de Cobertura - ${postoNome}`,
              html: html,
            })
            $app.newMailClient().send(mailer)
          }
        } catch (mErr) {
          console.log('Erro ao enviar e-mail de reoferta em no-show:', mErr)
        }
      }

      // Atualiza escala para 'convocada'
      if (convCreated > 0) {
        escala.set('status', 'convocada')
        if (!escala.getFloat('valor_diaria')) {
          escala.set('valor_diaria', valorDiariaFreelancer)
        }
        $app.save(escala)
      }
    } catch (err) {
      console.log('Erro ao reofertar turno no-show:', err)
    }
  }
}, 'convocacoes')
