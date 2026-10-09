// pocketbase/hooks/hook_nova_convocacao.js
onRecordAfterCreateSuccess((e) => {
  e.next()

  const record = e.record
  const proId = record.getString('pro')
  const escalaId = record.getString('escala')
  const status = record.getString('status')

  // Dispara apenas para novas convocações pendentes
  if (status !== 'pendente') return

  try {
    const proUser = $app.findRecordById('users', proId)
    const proEmail = proUser.email()
    if (!proEmail) return

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

    let postoNome = 'Posto'
    let dataEscala = ''
    let turnoInicio = ''
    let turnoFim = ''
    let modeloRemuneracao = ''
    const valDiaria = record.getFloat('valor_diaria') || 0
    const regraAplicada = record.getString('regra_aplicada') || 'motor de diária'

    try {
      const escala = $app.findRecordById('escalas', escalaId)
      dataEscala = escala.getString('data').slice(0, 10)
      turnoInicio = escala.getString('turno_inicio')
      turnoFim = escala.getString('turno_fim')

      const posto = $app.findRecordById('postos', escala.getString('posto'))
      postoNome = posto.getString('nome')

      const proFixoId = posto.getString('pro_fixo')
      const forma =
        posto.getString('forma_de_contratacao') ||
        posto.getString('tipo_remuneracao_fixa') ||
        'mensalista'
      const salMensal =
        posto.getFloat('salario_mensal') ||
        (forma === 'mensalista' ? posto.getFloat('valor_remuneracao_fixa') : 0)
      const valHora =
        posto.getFloat('valor_hora') ||
        (forma === 'horista' ? posto.getFloat('valor_remuneracao_fixa') : 0)

      if (proFixoId && proFixoId === proId) {
        if (forma === 'mensalista' || forma === 'mensal') {
          modeloRemuneracao = `Fixa Mensalista (Contrato Salarial R$ ${salMensal.toFixed(2)}/mês)`
        } else if (forma === 'horista' || forma === 'por_hora') {
          modeloRemuneracao = `Fixa Horista (R$ ${valHora.toFixed(2)}/h × ${posto.getInt('carga_horaria') || 8}h = R$ ${valDiaria.toFixed(2)})`
        }
      }
    } catch (errPosto) {
      console.log('Erro ao buscar dados do posto/escala no hook_nova_convocacao:', errPosto)
    }

    if (!modeloRemuneracao) {
      modeloRemuneracao = `Freelancer (Diária R$ ${valDiaria.toFixed(2)} - ${regraAplicada})`
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="background-color: #0f766e; color: #ffffff; padding: 16px; border-radius: 6px; text-align: center;">
          <h2 style="margin: 0; font-size: 20px;">${senderName}</h2>
          <p style="margin: 4px 0 0 0; font-size: 13px;">Nova Convocação Disponível</p>
        </div>
        <div style="padding: 20px 0; color: #334155; font-size: 14px; line-height: 1.6;">
          <p>Olá, <strong>${proUser.getString('name') || 'Profissional'}</strong>!</p>
          <p>Você recebeu uma nova convocação de turno com os seguintes detalhes:</p>
          <div style="background-color: #f8fafc; border-left: 4px solid #0f766e; padding: 12px; margin: 16px 0;">
            <p style="margin: 0;"><strong>Posto:</strong> ${postoNome}</p>
            <p style="margin: 4px 0 0 0;"><strong>Data do Turno:</strong> ${dataEscala}</p>
            <p style="margin: 4px 0 0 0;"><strong>Horário:</strong> ${turnoInicio} às ${turnoFim}</p>
            <p style="margin: 4px 0 0 0;"><strong>Modelo de Remuneração:</strong> ${modeloRemuneracao}</p>
          </div>
          <p style="font-size: 13px;">Acesse a plataforma para aceitar ou recusar esta convocação.</p>
        </div>
        <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; text-align: center;">
          Enviado automaticamente por ${senderName}.
        </div>
      </div>
    `

    const mailer = new MailerMessage({
      from: { address: senderEmail, name: senderName },
      to: [{ address: proEmail }],
      subject: `[${senderName}] Nova Convocação para o Posto ${postoNome}`,
      html: html,
    })
    $app.newMailClient().send(mailer)

    // Notificação Push no celular (PWA) para o profissional convocado (push_outbox + tickle / push com payload)
    try {
      let VAPID = (typeof globalThis !== 'undefined' && globalThis.VAPID) || null
      if (!VAPID) {
        try {
          VAPID = require(`${__hooks}/lib_vapid.pb.js`)
        } catch (_) {
          try {
            VAPID = require(`${__hooks}/lib_vapid.js`)
          } catch (_) {}
        }
      }
      if (!VAPID || typeof VAPID.sendPushNotification !== 'function') {
        console.log('[PUSH] VAPID não configurado — envio abortado')
        return
      }
      const pushSubs = $app.findRecordsByFilter(
        'push_subscriptions',
        "user = '" + proId + "'",
        '-created',
        20,
        0,
      )
      const pushTitle = 'Nova convocação disponível'
      const pushBody = `Nova convocação: ${postoNome}, ${dataEscala} ${turnoInicio} às ${turnoFim}`
      const pushUrl = '/convocacoes'
      const pushTag = 'nova-convocacao-' + record.id

      for (let s = 0; s < pushSubs.length; s++) {
        const sub = pushSubs[s]
        const ep = sub.getString('endpoint')

        // 1. Gravar na fila push_outbox para entrega resiliente
        let outboxId = ''
        try {
          const outboxCol = $app.findCollectionByNameOrId('push_outbox')
          const outboxRec = new Record(outboxCol)
          outboxRec.set('user', proId)
          outboxRec.set('endpoint', ep)
          outboxRec.set('title', pushTitle)
          outboxRec.set('body', pushBody)
          outboxRec.set('url', pushUrl)
          outboxRec.set('tag', pushTag)
          outboxRec.set('lido', false)
          $app.save(outboxRec)
          outboxId = outboxRec.id
        } catch (outboxErr) {
          console.log('[PUSH] Erro ao gravar push_outbox para convocação:', outboxErr)
        }

        // 2. Disparo HTTP assinado com VAPID para o push service
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
            '[PUSH] Push de nova convocação enviado com sucesso (HTTP ' +
              pushRes.statusCode +
              ') para sub ' +
              sub.id,
          )
        } else if (pushRes.expired) {
          console.log(
            '[PUSH] Assinatura expirada (HTTP ' +
              pushRes.statusCode +
              ') para sub ' +
              sub.id +
              '. Removendo do banco.',
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
              ') ao enviar push de convocação para sub ' +
              sub.id +
              ' [' +
              ep.slice(0, 40) +
              '...]',
          )
        }
      }
    } catch (pushErr) {
      console.log('[PUSH] Erro geral ao buscar inscrições push do pro:', pushErr)
    }
  } catch (err) {
    console.log('Erro geral ao enviar e-mail de nova convocação:', err)
  }
}, 'convocacoes')
