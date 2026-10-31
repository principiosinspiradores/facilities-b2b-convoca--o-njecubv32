// pocketbase/hooks/router_cancelar_convocacao_gestao.js
/// <reference path="../pb_data/types.d.ts" />

/**
 * Endpoint para cancelamento de convocação aceita pela gestão (admin ou empresa).
 * Rota: POST /backend/v1/facilities/cancelar-convocacao-gestao
 * Body: { convocacao_id: string }
 *
 * Regras:
 * 1. Apenas usuários autenticados com role 'admin' ou 'empresa' podem chamar (lido de e.auth).
 * 2. Guarda de Ponto: Se já existir registro de ponto de CHEGADA da pro naquela escala,
 *    bloquear o cancelamento com a mensagem exata:
 *    "A profissional já registrou ponto de chegada — trate pela Conferência de Ponto."
 * 3. Status da convocação -> 'cancelada' com
 *    regra_aplicada = 'Cancelada pela gestão (vaga desistida pelo cliente)'
 * 4. Payout em escrow vinculado (status 'retido') -> 'cancelado' (sem multa, sem evento de multa, sem repasse).
 * 5. Escala volta a ficar com status = 'aberta' (se não houver outras convocações aceitas nela).
 * 6. Notificar a pro por e-mail + push usando a mensagem padrão:
 *    "Sua convocação em [posto] em [data] ([turno]) foi cancelada pela gestão."
 */

routerAdd('POST', '/backend/v1/facilities/cancelar-convocacao-gestao', (e) => {
  const authRecord = e.auth
  if (!authRecord) {
    return e.json(401, { message: 'Não autorizado. Faça login como gestor.' })
  }

  const role = authRecord.getString('role')
  if (role !== 'admin' && role !== 'empresa') {
    return e.json(403, { message: 'Apenas administradores e empresas podem cancelar convocações.' })
  }

  let body = {}
  try {
    body = e.requestInfo().body || {}
  } catch (_) {
    body = {}
  }

  const convocacaoId = body.convocacao_id || body.convocacaoId
  if (!convocacaoId) {
    return e.json(400, { message: 'ID da convocação é obrigatório.' })
  }

  let convRecord
  try {
    convRecord = $app.findRecordById('convocacoes', convocacaoId)
  } catch (_) {
    return e.json(404, { message: 'Convocação não encontrada.' })
  }

  const statusAtual = convRecord.getString('status')
  if (statusAtual !== 'aceita') {
    return e.json(400, {
      message: `Esta convocação está com status "${statusAtual}". Apenas convocações aceitas podem ser canceladas por esta rotina.`,
    })
  }

  const escalaId = convRecord.getString('escala')
  const proId = convRecord.getString('pro')

  let escalaRecord = null
  let postoRecord = null
  try {
    if (escalaId) {
      escalaRecord = $app.findRecordById('escalas', escalaId)
      if (escalaRecord) {
        const postoId = escalaRecord.getString('posto')
        if (postoId) {
          postoRecord = $app.findRecordById('postos', postoId)
        }
      }
    }
  } catch (errEscala) {
    console.log('[CANCELAR_GESTAO] Erro ao carregar escala/posto:', errEscala)
  }

  // GUARDA OBRIGATÓRIA: Se já existir registro de ponto de CHEGADA da pro naquela escala,
  // BLOQUEAR o cancelamento com a mensagem "A profissional já registrou ponto de chegada — trate pela Conferência de Ponto."
  const dataEscalaStr = escalaRecord ? escalaRecord.getString('data').slice(0, 10) : ''
  try {
    let filtroPonto = `pro = '${proId}' && tipo = 'chegada'`
    if (escalaId) {
      filtroPonto += ` && (escala = '${escalaId}' || timestamp_real ~ '${dataEscalaStr}')`
    } else if (dataEscalaStr) {
      filtroPonto += ` && timestamp_real ~ '${dataEscalaStr}'`
    }

    const pontosChegada = $app.findRecordsByFilter('pontos', filtroPonto, '-created', 10, 0)
    let temChegada = false
    if (pontosChegada && pontosChegada.length > 0) {
      for (let i = 0; i < pontosChegada.length; i++) {
        const p = pontosChegada[i]
        const pEscala = p.getString('escala')
        const pData = (p.getString('timestamp_real') || p.getString('created') || '').slice(0, 10)
        if (pEscala === escalaId || (dataEscalaStr && pData === dataEscalaStr)) {
          temChegada = true
          break
        }
      }
    }

    if (temChegada) {
      return e.json(400, {
        message: 'A profissional já registrou ponto de chegada — trate pela Conferência de Ponto.',
      })
    }
  } catch (errPonto) {
    console.log('[CANCELAR_GESTAO] Erro ao verificar pontos de chegada:', errPonto)
  }

  // 1. Atualizar status da convocação -> 'cancelada' com regra_aplicada exata
  const regraGestao = 'Cancelada pela gestão (vaga desistida pelo cliente)'
  convRecord.set('status', 'cancelada')
  convRecord.set('regra_aplicada', regraGestao)
  $app.save(convRecord)

  // 2. Atualizar status da escala -> reabrir para que volte a ficar aberta e conte vagas corretamente
  if (escalaRecord) {
    try {
      escalaRecord.set('status', 'aberta')
      $app.save(escalaRecord)
    } catch (errReabrir) {
      console.log('[CANCELAR_GESTAO] Erro ao reabrir escala:', errReabrir)
    }
  }

  // 3. Payout vinculado em escrow (status 'retido') -> 'cancelado'
  // Sem multa, sem evento de multa, sem repasse.
  let payoutsAfetados = 0
  try {
    const payoutsList = $app.findRecordsByFilter(
      'payouts',
      `escala = '${escalaId}' && pro = '${proId}' && status = 'retido'`,
      '-created',
      10,
      0,
    )
    for (let p = 0; p < payoutsList.length; p++) {
      const pay = payoutsList[p]
      pay.set('status', 'cancelado')
      $app.save(pay)
      payoutsAfetados++
    }
  } catch (errPayout) {
    console.log('[CANCELAR_GESTAO] Erro ao cancelar payouts retidos:', errPayout)
  }

  // Obter dados legíveis para a notificação
  const postoNome = postoRecord ? postoRecord.getString('nome') : 'Posto'
  let formatarDataBR = (s) => s
  try {
    if (typeof DataBRExports !== 'undefined' && DataBRExports.formatarDataBR) {
      formatarDataBR = DataBRExports.formatarDataBR
    } else if (typeof require !== 'undefined') {
      formatarDataBR = require(`${__hooks}/lib_data_br.js`).formatarDataBR
    }
  } catch (_) {}
  const dataFormatada = formatarDataBR(dataEscalaStr)

  const turnoInicio = escalaRecord ? escalaRecord.getString('turno_inicio') : ''
  const turnoFim = escalaRecord ? escalaRecord.getString('turno_fim') : ''
  const turnoTexto =
    turnoInicio && turnoFim ? `${turnoInicio} às ${turnoFim}` : turnoInicio || 'Turno'

  const mensagemNotificacao = `Sua convocação em ${postoNome} em ${dataFormatada} (${turnoTexto}) foi cancelada pela gestão.`

  // 4. Notificar a pro por Push Notification
  try {
    const pushTitle = 'Convocação Cancelada'
    const pushBody = mensagemNotificacao
    const pushUrl = '/convocacoes'
    const pushTag = `cancelada-gestao-${convRecord.id}`

    // Gravar no push_outbox para histórico e consumo do PWA
    try {
      const outboxCol = $app.findCollectionByNameOrId('push_outbox')
      const outboxRec = new Record(outboxCol)
      outboxRec.set('user', proId)
      outboxRec.set('endpoint', '')
      outboxRec.set('title', pushTitle)
      outboxRec.set('body', pushBody)
      outboxRec.set('url', pushUrl)
      outboxRec.set('tag', pushTag)
      outboxRec.set('lido', false)
      $app.save(outboxRec)
    } catch (errOutbox) {
      console.log('[CANCELAR_GESTAO] Erro ao salvar push_outbox geral:', errOutbox)
    }

    // Disparar push web se houver subscrições ativas
    try {
      const subs = $app.findRecordsByFilter(
        'push_subscriptions',
        `user = '${proId}'`,
        '-created',
        10,
        0,
      )
      if (subs && subs.length > 0) {
        for (let s = 0; s < subs.length; s++) {
          const sub = subs[s]
          const ep = sub.getString('endpoint')
          if (!ep) continue

          try {
            const outboxCol = $app.findCollectionByNameOrId('push_outbox')
            const ob = new Record(outboxCol)
            ob.set('user', proId)
            ob.set('endpoint', ep)
            ob.set('title', pushTitle)
            ob.set('body', pushBody)
            ob.set('url', pushUrl)
            ob.set('tag', pushTag)
            ob.set('lido', false)
            $app.save(ob)
          } catch (_) {}
        }
      }
    } catch (errSubs) {
      console.log('[CANCELAR_GESTAO] Erro ao despachar subscrições push:', errSubs)
    }
  } catch (errPush) {
    console.log('[CANCELAR_GESTAO] Erro ao enviar push para a pro:', errPush)
  }

  // 5. Notificar a pro por E-mail
  try {
    const proUser = $app.findRecordById('users', proId)
    const proEmail = proUser ? proUser.email() : ''
    const proNome = proUser ? proUser.getString('name') || 'Profissional' : 'Profissional'

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

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <div style="background-color: #0f766e; color: #ffffff; padding: 16px; border-radius: 6px; text-align: center;">
            <h2 style="margin: 0; font-size: 20px;">${senderName}</h2>
            <p style="margin: 4px 0 0 0; font-size: 13px;">Aviso de Cancelamento de Convocação</p>
          </div>
          <div style="padding: 20px 0; color: #334155; font-size: 14px; line-height: 1.6;">
            <p>Olá, <strong>${proNome}</strong>!</p>
            <p>${mensagemNotificacao}</p>
            <div style="background-color: #f1f5f9; border-left: 4px solid #0f766e; padding: 12px; margin: 16px 0;">
              <p style="margin: 0;"><strong>Posto:</strong> ${postoNome}</p>
              <p style="margin: 4px 0 0 0;"><strong>Data:</strong> ${dataFormatada}</p>
              <p style="margin: 4px 0 0 0;"><strong>Turno:</strong> ${turnoTexto}</p>
              <p style="margin: 4px 0 0 0; color: #64748b; font-size: 12px;">Motivo: Vaga desistida pelo cliente / cancelada pela gestão. Nenhuma penalidade ou multa foi aplicada ao seu perfil.</p>
            </div>
            <p style="font-size: 13px;">Fique atenta às próximas convocações no aplicativo.</p>
          </div>
          <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; text-align: center;">
            Enviado automaticamente por ${senderName}.
          </div>
        </div>
      `

      const mailer = new MailerMessage({
        from: { address: senderEmail, name: senderName },
        to: [{ address: proEmail }],
        subject: `[${senderName}] Convocação cancelada pela gestão - ${postoNome}`,
        html: html,
      })
      $app.newMailClient().send(mailer)
      console.log(`[CANCELAR_GESTAO] E-mail de cancelamento enviado com sucesso para ${proEmail}`)
    }
  } catch (errEmail) {
    console.log('[CANCELAR_GESTAO] Erro ao enviar e-mail de cancelamento para pro:', errEmail)
  }

  // 6. RECUPERAÇÃO / RETOMADA DE CANDIDATOS (Reofertar opcional, default false)
  // Caso reofertar === true:
  // - Não reofertar se já houver convocação status='pendente' nesta mesma escala.
  // - Buscar convocações da MESMA escala com regra_aplicada = 'Vaga já preenchida' (exclusivamente essas).
  // - Cruzar com buscarProsElegiveisReoferta (excluindo a pro do aceite cancelado e quem não for mais elegível).
  // - Criar pendentes com regra_aplicada = 'EMERGENCIAL RETOMADA — ' + regra do motor.
  // - Push / e-mail disparados automaticamente pelo hook_nova_convocacao.
  const reofertar = body.reofertar === true || body.reofertar === 'true'
  let retomadasCriadas = 0
  const retomadasIds = []

  if (reofertar && escalaRecord) {
    try {
      // Verificar se já existe convocação pendente na mesma escala
      const pendentesExistentes = $app.findRecordsByFilter(
        'convocacoes',
        `escala = '${escalaId}' && status = 'pendente'`,
        '-created',
        1,
        0,
      )

      if (pendentesExistentes && pendentesExistentes.length > 0) {
        console.log(
          `[CANCELAR_GESTAO] Reoferta abortada: escala ${escalaId} já possui convocação pendente ativa.`,
        )
      } else {
        // Carregar motor de elegibilidade
        let elegibilidadeMotor = null
        if (
          typeof ElegibilidadeReoferta !== 'undefined' &&
          ElegibilidadeReoferta &&
          ElegibilidadeReoferta.buscarProsElegiveisReoferta
        ) {
          elegibilidadeMotor = ElegibilidadeReoferta
        } else if (
          typeof globalThis !== 'undefined' &&
          globalThis.ElegibilidadeReoferta &&
          globalThis.ElegibilidadeReoferta.buscarProsElegiveisReoferta
        ) {
          elegibilidadeMotor = globalThis.ElegibilidadeReoferta
        } else if (typeof require !== 'undefined') {
          try {
            elegibilidadeMotor = require(`${__hooks}/lib_elegibilidade_reoferta.js`)
          } catch (_) {
            try {
              elegibilidadeMotor = require('./lib_elegibilidade_reoferta.js')
            } catch (_) {}
          }
        }

        if (!elegibilidadeMotor || !elegibilidadeMotor.buscarProsElegiveisReoferta) {
          console.log(
            `[CANCELAR_GESTAO] Motor ElegibilidadeReoferta indisponível para retomada de escala ${escalaId}.`,
          )
        } else {
          // Buscar convocações da MESMA escala com regra_aplicada = 'Vaga já preenchida' (apenas essas; recusadas/expiradas fora)
          const convsPreenchidas = $app.findRecordsByFilter(
            'convocacoes',
            `escala = '${escalaId}' && regra_aplicada = 'Vaga já preenchida'`,
            'created',
            100,
            0,
          )

          if (convsPreenchidas && convsPreenchidas.length > 0) {
            // Mapear IDs das pros que estavam com "Vaga já preenchida"
            const prosPreenchidasMap = {}
            for (let cpIdx = 0; cpIdx < convsPreenchidas.length; cpIdx++) {
              const cpProId = convsPreenchidas[cpIdx].getString('pro')
              if (cpProId && cpProId !== proId) {
                prosPreenchidasMap[cpProId] = convsPreenchidas[cpIdx]
              }
            }

            // Consultar motor de elegibilidade com ignorarJaConvocadaNestaEscala=true
            // (pois essas pros já tinham registro cancelado nesta mesma escala)
            const prosElegiveis =
              elegibilidadeMotor.buscarProsElegiveisReoferta({
                escala: escalaRecord,
                posto: postoRecord,
                proExcluidoId: proId,
                now: new Date(),
                ignorarJaConvocadaNestaEscala: true,
              }) || []

            const valDiariaBase =
              escalaRecord.getFloat('valor_diaria') ||
              (postoRecord ? postoRecord.getFloat('valor_diaria_base') : 0) ||
              180
            const convocacoesCol = $app.findCollectionByNameOrId('convocacoes')
            const nowIso = new Date().toISOString()

            for (let peIdx = 0; peIdx < prosElegiveis.length; peIdx++) {
              const candidata = prosElegiveis[peIdx]
              const cId = candidata.id

              // Só convocar se era da lista de "Vaga já preenchida" da mesma escala e não for a pro do aceite cancelado
              if (!prosPreenchidasMap[cId] || cId === proId) {
                continue
              }

              // Mesma lógica de valor e regra do motor
              let regraMotor = 'tabela base'
              let valDiaria = valDiariaBase

              if (candidata.getString('status') === 'teste') {
                valDiaria = candidata.getFloat('ajuda_custo') || 50
                regraMotor = 'ajuda de custo (teste)'
              } else if (candidata.getFloat('valor_negociado')) {
                valDiaria = candidata.getFloat('valor_negociado')
                regraMotor = 'valor negociado'
              }

              const regraAplicada = `EMERGENCIAL RETOMADA — ${regraMotor}`

              try {
                const novaConv = new Record(convocacoesCol)
                novaConv.set('escala', escalaId)
                novaConv.set('pro', cId)
                novaConv.set('status', 'pendente')
                novaConv.set('valor_diaria', valDiaria)
                novaConv.set('regra_aplicada', regraAplicada)
                novaConv.set('data_convocacao', nowIso)
                novaConv.set('confirmacao_presenca', 'nao_confirmada')
                $app.save(novaConv)

                retomadasCriadas++
                retomadasIds.push(novaConv.id)
              } catch (errSaveRetomada) {
                console.log(
                  `[CANCELAR_GESTAO] Falha ao recriar convocação retomada para pro ${cId}:`,
                  errSaveRetomada,
                )
              }
            }

            if (retomadasCriadas > 0) {
              try {
                escalaRecord.set('status', 'convocada')
                $app.save(escalaRecord)
              } catch (_) {}

              // Registrar no histórico da escala
              try {
                const histCol = $app.findCollectionByNameOrId('historico_escalas')
                const hist = new Record(histCol)
                hist.set('escala', escalaId)
                hist.set('usuario', authRecord.id)
                hist.set('acao', 'reoferta_emergencial')
                hist.set(
                  'descricao',
                  `Cancelamento pela gestão com retomada emergencial disparada para ${retomadasCriadas} profissional(is) ex-'Vaga já preenchida'.`,
                )
                hist.set(
                  'detalhes',
                  JSON.stringify({
                    convocacao_cancelada: convRecord.id,
                    pro_cancelada: proId,
                    retomadas_criadas: retomadasCriadas,
                    convocacoes_ids: retomadasIds,
                  }),
                )
                $app.save(hist)
              } catch (_) {}
            }
          }
        }
      }
    } catch (errRetomada) {
      console.log('[CANCELAR_GESTAO] Erro no fluxo de retomada:', errRetomada)
    }
  }

  return e.json(200, {
    success: true,
    message:
      retomadasCriadas > 0
        ? `Convocação cancelada pela gestão. Retomada emergencial disparada para ${retomadasCriadas} candidato(s) anterior(es).`
        : 'Convocação cancelada com sucesso pela gestão.',
    convocacao_id: convRecord.id,
    payouts_cancelados: payoutsAfetados,
    retomadas_criadas: retomadasCriadas,
    retomadas_ids: retomadasIds,
  })
})
