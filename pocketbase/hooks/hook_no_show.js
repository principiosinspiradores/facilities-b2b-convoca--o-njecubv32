// pocketbase/hooks/hook_no_show.js
// Idempotência e suspensão por Atestado Médico

onRecordUpdate((e) => {
  function aplicarMultaNoShow(
    convocacaoRecord,
    escalaId,
    proId,
    now,
    valorMulta,
    motivoComplemento,
  ) {
    // 1. Evitar cobrança duplicada verificando se já existe payment_event de multa_falta para esta convocação / escala
    const existingEvents = $app.findRecordsByFilter(
      'payment_events',
      "tipo = 'multa_falta' && metadata ~ '" + convocacaoRecord.id + "'",
      '-created',
      1,
      0,
    )
    if (existingEvents && existingEvents.length > 0) {
      console.log('Multa já aplicada anteriormente para a convocação:', convocacaoRecord.id)
      return
    }

    // 2. Se houver payout retido, cancelar e aplicar a dedução da multa
    const payouts = $app.findRecordsByFilter(
      'payouts',
      "escala = '" + escalaId + "' && pro = '" + proId + "' && status = 'retido'",
      '-created',
      1,
      0,
    )

    const eventsCol = $app.findCollectionByNameOrId('payment_events')

    if (payouts && payouts.length > 0) {
      const pay = payouts[0]
      pay.set('status', 'cancelado')
      $app.save(pay)

      const ev = new Record(eventsCol)
      ev.set('payout', pay.id)
      ev.set('tipo', 'multa_falta')
      ev.set('valor', -valorMulta)
      ev.set('data', now.toISOString())
      ev.set('metadata', {
        motivo: motivoComplemento || 'Falta do profissional ao turno (no-show)',
        escala_id: escalaId,
        pro_id: proId,
        convocacao_id: convocacaoRecord.id,
        multa_aplicada: valorMulta,
      })
      $app.save(ev)
    } else {
      // Criar evento isolado de multa
      const ev = new Record(eventsCol)
      ev.set('tipo', 'multa_falta')
      ev.set('valor', -valorMulta)
      ev.set('data', now.toISOString())
      ev.set('metadata', {
        motivo: motivoComplemento || 'Falta do profissional ao turno (no-show - pro fixo/mensal)',
        escala_id: escalaId,
        pro_id: proId,
        convocacao_id: convocacaoRecord.id,
        multa_aplicada: valorMulta,
      })
      $app.save(ev)
    }
  }
  e.next()

  const record = e.record
  const originalStatus = e.record.original().getString('status')
  const newStatus = record.getString('status')

  // Disparar quando escala ou convocação for marcada como 'falta'
  if (originalStatus !== 'falta' && newStatus === 'falta') {
    const escalaId = record.getString('escala')
    const proId = record.getString('pro')
    const now = new Date()

    // Notificação Push de Falta (no-show) para usuários da empresa do posto e admin via push_outbox e tickle
    try {
      let VAPID = (typeof globalThis !== 'undefined' && globalThis.VAPID) || null
      if (!VAPID) {
        try {
          VAPID = require(`${__hooks}/lib_vapid.pb.js`)
        } catch (_) {
          VAPID = require('./lib_vapid.pb.js')
        }
      }
      let postoNome = 'Posto'
      let dataEscala = ''
      try {
        const esc = $app.findRecordById('escalas', escalaId)
        dataEscala = esc.getString('data').slice(0, 10)
        const pos = $app.findRecordById('postos', esc.getString('posto'))
        postoNome = pos.getString('nome')
      } catch (_) {}

      let proNome = 'Profissional'
      try {
        const proUser = $app.findRecordById('users', proId)
        proNome = proUser.getString('name') || proUser.email() || 'Profissional'
      } catch (_) {}

      const gestores = $app.findRecordsByFilter(
        'users',
        "(role = 'empresa' || role = 'admin') && status = 'ativo'",
        '-created',
        20,
        0,
      )

      const pushTitle = 'Falta registrada (No-show)'
      const pushBody = `Falta registrada para ${proNome} no posto ${postoNome} em ${dataEscala}. Vaga aberta para cobertura.`
      const pushUrl = '/cobertura'
      const pushTag = 'falta-noshow-' + record.id

      for (let g = 0; g < gestores.length; g++) {
        const gestorId = gestores[g].id
        const subs = $app.findRecordsByFilter(
          'push_subscriptions',
          "user = '" + gestorId + "'",
          '-created',
          10,
          0,
        )
        for (let s = 0; s < subs.length; s++) {
          const sub = subs[s]
          const ep = sub.getString('endpoint')

          // 1. Gravar na fila push_outbox
          try {
            const outboxCol = $app.findCollectionByNameOrId('push_outbox')
            const outboxRec = new Record(outboxCol)
            outboxRec.set('user', gestorId)
            outboxRec.set('endpoint', ep)
            outboxRec.set('title', pushTitle)
            outboxRec.set('body', pushBody)
            outboxRec.set('url', pushUrl)
            outboxRec.set('tag', pushTag)
            outboxRec.set('lido', false)
            $app.save(outboxRec)
          } catch (outboxErr) {
            console.log('[PUSH] Erro ao gravar push_outbox de falta:', outboxErr)
          }

          // 2. Disparo HTTP assinado com VAPID
          const pushRes = VAPID.sendPushNotification(
            ep,
            {
              title: pushTitle,
              body: pushBody,
              url: pushUrl,
              icon: '/favicon.ico',
              badge: '/favicon.ico',
              tag: pushTag,
            },
            { urgency: 'high', ttl: 86400 },
          )

          if (pushRes.success) {
            console.log(
              '[PUSH] Push de falta no-show entregue (HTTP ' +
                pushRes.statusCode +
                ') para sub ' +
                sub.id,
            )
          } else if (pushRes.expired) {
            console.log(
              '[PUSH] Subscrição expirada (HTTP ' +
                pushRes.statusCode +
                ') para sub ' +
                sub.id +
                '. Removendo.',
            )
            try {
              $app.delete(sub)
            } catch (_) {}
          } else {
            console.log(
              '[PUSH] Falha (status ' +
                pushRes.statusCode +
                ', erro: ' +
                (pushRes.error || pushRes.rawText || 'não especificado') +
                ') ao enviar push de falta para sub ' +
                sub.id +
                ' [' +
                ep.slice(0, 40) +
                '...]',
            )
          }
        }
      }
    } catch (errPushFalta) {
      console.log('[PUSH] Erro geral ao enviar push de falta:', errPushFalta)
    }

    // 0. Ler valor da multa por falta configurado em settings
    let valorMulta = 50
    try {
      const settingsList = $app.findRecordsByFilter('settings', 'id != ""', '-created', 1, 0)
      if (settingsList && settingsList.length > 0) {
        valorMulta = settingsList[0].getFloat('multa_falta_pro') || 50
      }
    } catch (_) {}

    // 1. Atualizar a escala para 'falta' e marcar multa_aplicada = true
    let escala
    try {
      escala = $app.findRecordById('escalas', escalaId)
      escala.set('status', 'falta')
      escala.set('multa_aplicada', true)
      $app.save(escala)
    } catch (err) {
      console.log('Erro ao atualizar escala em no-show:', err)
    }

    // 2. VERIFICAR SE EXISTE ATESTADO MÉDICO PENDENTE PARA ESTA CONVOCAÇÃO
    // Se existir atestado pendente, SUSPENDER A MULTA (não cobrar agora)
    let temAtestadoPendente = false
    try {
      const atestadosPendentes = $app.findRecordsByFilter(
        'atestados',
        "convocacao = '" + record.id + "' && status_validacao = 'pendente'",
        '-created',
        1,
        0,
      )
      if (atestadosPendentes && atestadosPendentes.length > 0) {
        temAtestadoPendente = true
      }
    } catch (errAtestado) {
      console.log('Erro ao checar atestados pendentes:', errAtestado)
    }

    if (temAtestadoPendente) {
      console.log(
        'Multa de no-show SUSPENSA devido a atestado médico pendente para convocação:',
        record.id,
      )
    } else {
      // 3. Aplicar multa de falta imediatamente se não houver atestado pendente
      try {
        aplicarMultaNoShow(
          record,
          escalaId,
          proId,
          now,
          valorMulta,
          'Falta do profissional ao turno (no-show)',
        )
      } catch (err) {
        console.log('Erro ao processar multa em hook_no_show:', err)
      }
    }

    // 4. Auto-reofertar o turno para freelancers elegíveis
    try {
      if (!escala) escala = $app.findRecordById('escalas', escalaId)
      const posto = $app.findRecordById('postos', escala.getString('posto'))
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
        let regra = 'reoferta automática por falta (no-show)'

        if (p.getString('status') === 'teste') {
          proValor = p.getFloat('ajuda_custo') || 50
          regra = 'reoferta por falta (ajuda de custo - teste)'
        } else if (p.getFloat('valor_negociado') > 0) {
          proValor = p.getFloat('valor_negociado')
          regra = 'reoferta por falta (valor negociado)'
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

            const postoNome = posto.getString('nome')
            const dataEscala = escala.getString('data').slice(0, 10)
            const turnoInicio = escala.getString('turno_inicio')
            const turnoFim = escala.getString('turno_fim')

            const html = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <div style="background-color: #dc2626; color: #ffffff; padding: 16px; border-radius: 6px; text-align: center;">
                  <h2 style="margin: 0; font-size: 20px;">${senderName}</h2>
                  <p style="margin: 4px 0 0 0; font-size: 13px;">Ocorrência de Falta & Reoferta Urgente</p>
                </div>
                <div style="padding: 20px 0; color: #334155; font-size: 14px; line-height: 1.6;">
                  <p>Olá, <strong>${p.getString('name') || 'Profissional'}</strong>!</p>
                  <p>Um turno teve ocorrência de falta/no-show e abriu uma oportunidade emergencial com valor especial para você:</p>
                  <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 12px; margin: 16px 0;">
                    <p style="margin: 0;"><strong>Posto:</strong> ${postoNome}</p>
                    <p style="margin: 4px 0 0 0;"><strong>Data:</strong> ${dataEscala}</p>
                    <p style="margin: 4px 0 0 0;"><strong>Horário:</strong> ${turnoInicio} às ${turnoFim}</p>
                    <p style="margin: 4px 0 0 0;"><strong>Valor da Diária:</strong> R$ ${proValor.toFixed(2)} (${regra})</p>
                  </div>
                  <p style="font-size: 13px;">Acesse o sistema o mais rápido possível para aceitar a convocação antes que outro profissional preencha a vaga.</p>
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

      if (countReoferta > 0) {
        escala.set('status', 'convocada')
        if (!escala.getFloat('valor_diaria')) {
          escala.set('valor_diaria', valorDiariaFreelancer)
        }
        $app.save(escala)
      }
    } catch (err) {
      console.log('Erro ao auto-reofertar em no-show:', err)
    }
  }
}, 'convocacoes')
