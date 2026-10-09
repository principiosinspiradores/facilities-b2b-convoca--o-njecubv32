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

    // 2. Se a profissional for fixa do posto com remuneração MENSAL (mensalista):
    // O valor dela NÃO entra no escrow por diária (é remuneração salarial mensal contratada fora de escrow)
    let isFixaMensal = false
    if (posto) {
      const proFixoId = posto.getString('pro_fixo')
      const forma =
        posto.getString('forma_de_contratacao') || posto.getString('tipo_remuneracao_fixa')
      if (proFixoId && proFixoId === proId && (forma === 'mensalista' || forma === 'mensal')) {
        isFixaMensal = true
      }
    }

    // 3. Gestão de vagas múltiplas e cancelamento de convocações pendentes
    // Identificar se a escala faz parte de um grupo de mesmo posto, data e turno
    try {
      if (escala) {
        const postoId = escala.getString('posto')
        const dataEscala = escala.getString('data').slice(0, 10)
        const turnoInicio = escala.getString('turno_inicio')
        const turnoFim = escala.getString('turno_fim')

        // Buscar todas as escalas deste mesmo posto, data e turno
        const escalasDoGrupo = $app.findRecordsByFilter(
          'escalas',
          "posto = '" +
            postoId +
            "' && data ~ '" +
            dataEscala +
            "' && turno_inicio = '" +
            turnoInicio +
            "' && turno_fim = '" +
            turnoFim +
            "' && status != 'cancelada'",
          'created',
          100,
          0,
        )

        const totalVagas = escalasDoGrupo.length

        // Contar quantas escalas já estão com status 'aceita' ou 'coberta' (ou 'concluida')
        let totalCobertas = 0
        const escalaIdsGrupo = []
        for (let i = 0; i < escalasDoGrupo.length; i++) {
          const esc = escalasDoGrupo[i]
          escalaIdsGrupo.push(esc.id)
          const st = esc.getString('status')
          if (st === 'aceita' || st === 'coberta' || st === 'concluida') {
            totalCobertas++
          }
        }

        // Se é posto com 1 vaga OU se o grupo preencheu todas as vagas (totalCobertas >= totalVagas):
        // Cancelar convocações pendentes restantes com aviso "vaga preenchida"
        if (totalCobertas >= totalVagas) {
          for (let g = 0; g < escalaIdsGrupo.length; g++) {
            const escId = escalaIdsGrupo[g]
            const outrasConvs = $app.findRecordsByFilter(
              'convocacoes',
              "escala = '" + escId + "' && status = 'pendente'",
              '-created',
              50,
              0,
            )
            for (let i = 0; i < outrasConvs.length; i++) {
              const c = outrasConvs[i]
              // Não alterar a convocação que acabou de ser aceita
              if (c.id === record.id) continue
              c.set('status', 'cancelada')
              c.set('regra_aplicada', 'Vaga já preenchida')
              $app.save(c)
            }
          }
        } else {
          // Grupo ainda tem vagas abertas!
          // Cancelar outras convocações pendentes apenas desta escala específica (para não ter 2 aceites na mesma escala)
          // Mas manter as convocações das outras escalas abertas do grupo
          const outrasConvsDestaEscala = $app.findRecordsByFilter(
            'convocacoes',
            "escala = '" + escalaId + "' && id != '" + record.id + "' && status = 'pendente'",
            '-created',
            50,
            0,
          )
          for (let i = 0; i < outrasConvsDestaEscala.length; i++) {
            const c = outrasConvsDestaEscala[i]
            // Se o grupo ainda tem vagas, o pro pode ser transferido ou ver como cancelada na escala
            c.set('status', 'cancelada')
            c.set('regra_aplicada', 'Vaga já preenchida')
            $app.save(c)
          }
        }
      }
    } catch (err) {
      console.log('Erro ao gerenciar cancelamento de convocações pendentes por vagas:', err)
    }

    // 4. Notificação por e-mail: Confirmação de aceite
    try {
      const proUser = $app.findRecordById('users', proId)
      const proEmail = proUser.email()
      if (proEmail) {
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

        const postoNome = posto ? posto.getString('nome') : 'Posto Designado'
        const turnoInicio = escala ? escala.getString('turno_inicio') : ''
        const turnoFim = escala ? escala.getString('turno_fim') : ''
        const dataEscala = escala ? escala.getString('data').slice(0, 10) : ''

        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="background-color: #0f766e; color: #ffffff; padding: 16px; border-radius: 6px; text-align: center;">
              <h2 style="margin: 0; font-size: 20px;">${senderName}</h2>
              <p style="margin: 4px 0 0 0; font-size: 13px;">Confirmação de Aceite de Turno</p>
            </div>
            <div style="padding: 20px 0; color: #334155; font-size: 14px; line-height: 1.6;">
              <p>Olá, <strong>${proUser.getString('name') || 'Profissional'}</strong>!</p>
              <p>Seu aceite para o turno foi confirmado com sucesso no sistema.</p>
              <div style="background-color: #f8fafc; border-left: 4px solid #0f766e; padding: 12px; margin: 16px 0;">
                <p style="margin: 0;"><strong>Posto:</strong> ${postoNome}</p>
                <p style="margin: 4px 0 0 0;"><strong>Data:</strong> ${dataEscala}</p>
                <p style="margin: 4px 0 0 0;"><strong>Horário:</strong> ${turnoInicio} às ${turnoFim}</p>
                <p style="margin: 4px 0 0 0;"><strong>Remuneração:</strong> ${isFixaMensal ? 'Fixa Mensal contratada' : 'R$ ' + valorDiaria.toFixed(2)}</p>
              </div>
              <p style="color: #64748b; font-size: 12px;">Lembre-se de registrar sua chegada com foto e geolocalização no horário programado ao chegar no posto.</p>
            </div>
            <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; text-align: center;">
              Enviado automaticamente por ${senderName}.
            </div>
          </div>
        `

        const mailer = new MailerMessage({
          from: { address: senderEmail, name: senderName },
          to: [{ address: proEmail }],
          subject: `[${senderName}] Confirmação de Aceite - ${postoNome}`,
          html: html,
        })
        $app.newMailClient().send(mailer)
      }
    } catch (mailErr) {
      console.log('Erro ao enviar e-mail de confirmação de aceite:', mailErr)
    }

    // Se for fixa mensal, não gera payout em escrow de diária
    if (isFixaMensal) {
      console.log('Pro fixa mensal aceitou escala. Escrow por diária omitido conforme regra.')
      return
    }

    // Notificação Push no celular (PWA) para os criadores / gestores da empresa e admin (push_outbox + tickle/push)
    try {
      let VAPID = (typeof globalThis !== 'undefined' && globalThis.VAPID) || null
      if (!VAPID) {
        try {
          VAPID = require(`${__hooks}/lib_vapid.pb.js`)
        } catch (_) {
          VAPID = require('./lib_vapid.pb.js')
        }
      }
      const postoNome = posto ? posto.getString('nome') : 'Posto Designado'
      const dataEscala = escala ? escala.getString('data').slice(0, 10) : ''
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

      const pushTitle = 'Convocação aceita'
      const pushBody = `${proNome} aceitou a convocação para o posto ${postoNome} em ${dataEscala}.`
      const pushUrl = '/escalas'
      const pushTag = 'aceite-convocacao-' + record.id

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
            console.log('[PUSH] Erro ao gravar push_outbox de aceite:', outboxErr)
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
            { urgency: 'normal', ttl: 86400 },
          )

          if (pushRes.success) {
            console.log(
              '[PUSH] Push de aceite de convocação entregue (HTTP ' +
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
                ') ao enviar push de aceite para sub ' +
                sub.id +
                ' [' +
                ep.slice(0, 40) +
                '...]',
            )
          }
        }
      }
    } catch (errPushGestor) {
      console.log('[PUSH] Erro geral ao enviar push de aceite para gestores:', errPushGestor)
    }

    // 5. Buscar settings para período de garantia (Freelancers ou Fixa por Hora)
    let guaranteeDays = 7
    let provider = 'mercadopago'
    try {
      const settingsList = $app.findRecordsByFilter('settings', 'id != ""', '-created', 1, 0)
      if (settingsList && settingsList.length > 0) {
        guaranteeDays = settingsList[0].getInt('guarantee_period_days') || 7
        provider = settingsList[0].getString('payout_provider') || 'mercadopago'
      }
    } catch (_) {}

    // 6. Criar ou atualizar payout status=retido (escrow contábil)
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

      // 7. Log em payment_events
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
