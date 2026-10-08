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

    // Notificação Push de recusa / cancelamento para os gestores (empresa e admin)
    try {
      const postoNome = posto ? posto.getString('nome') : 'Posto'
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

      const pushTitle = isRecusaDireta ? 'Convocação recusada' : 'Turno cancelado pelo profissional'
      const pushBody = isRecusaDireta
        ? `${proNome} recusou a convocação para o posto ${postoNome} em ${dataEscala}.`
        : `${proNome} cancelou o turno aceito para o posto ${postoNome} em ${dataEscala}.`
      const pushUrl = '/cobertura'

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
          try {
            const res = $http.send({
              url: ep,
              method: 'POST',
              headers: {
                TTL: '86400',
                Urgency: 'high',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                title: pushTitle,
                body: pushBody,
                url: pushUrl,
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                tag: 'recusa-convocacao-' + record.id,
              }),
              timeout: 8,
            })
            if (res.statusCode === 404 || res.statusCode === 410) {
              $app.delete(sub)
            }
          } catch (errP) {
            console.log('[PUSH] Erro ao enviar push de recusa de convocação:', errP)
          }
        }
      }
    } catch (errPushGestores) {
      console.log('[PUSH] Erro geral ao enviar push de recusa/cancelamento:', errPushGestores)
    }

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

          // Disparar e-mail de aviso de falta/cancelamento com reoferta
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
                  <div style="background-color: #f59e0b; color: #ffffff; padding: 16px; border-radius: 6px; text-align: center;">
                    <h2 style="margin: 0; font-size: 20px;">${senderName}</h2>
                    <p style="margin: 4px 0 0 0; font-size: 13px;">Oportunidade de Substituição / Reoferta de Turno</p>
                  </div>
                  <div style="padding: 20px 0; color: #334155; font-size: 14px; line-height: 1.6;">
                    <p>Olá, <strong>${p.getString('name') || 'Profissional'}</strong>!</p>
                    <p>Um turno foi cancelado/liberado pelo profissional anterior e está sendo reofertado com prioridade para você:</p>
                    <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px; margin: 16px 0;">
                      <p style="margin: 0;"><strong>Posto:</strong> ${postoNome}</p>
                      <p style="margin: 4px 0 0 0;"><strong>Data:</strong> ${dataEscala}</p>
                      <p style="margin: 4px 0 0 0;"><strong>Horário:</strong> ${turnoInicio} às ${turnoFim}</p>
                      <p style="margin: 4px 0 0 0;"><strong>Valor da Diária:</strong> R$ ${proValor.toFixed(2)} (${regra})</p>
                    </div>
                    <p style="font-size: 13px;">Acesse seu painel agora mesmo para aceitar a convocação antes que outro profissional assuma o turno.</p>
                  </div>
                  <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; text-align: center;">
                    Enviado automaticamente por ${senderName}.
                  </div>
                </div>
              `

              const mailer = new MailerMessage({
                from: { address: senderEmail, name: senderName },
                to: [{ address: pEmail }],
                subject: `[${senderName}] Reoferta Urgente de Turno - ${postoNome}`,
                html: html,
              })
              $app.newMailClient().send(mailer)
            }
          } catch (mErr) {
            console.log('Erro ao enviar e-mail de reoferta em cancelamento:', mErr)
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
        console.log('Erro ao reofertar em cancelamento/recusa da fixa:', err)
      }
    }
  }
}, 'convocacoes')
