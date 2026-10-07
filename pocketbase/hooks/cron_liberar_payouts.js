// pocketbase/hooks/cron_liberar_payouts.js
cronAdd('liberar_payouts_escrow', '*/10 * * * *', () => {
  const now = new Date()
  const nowIso = now.toISOString()

  // Buscar payouts status=retido, disputa_aberta=false, data_liberacao <= agora
  try {
    const payouts = $app.findRecordsByFilter(
      'payouts',
      "status = 'retido' && disputa_aberta = false && data_liberacao <= '" + nowIso + "'",
      'created',
      100,
      0,
    )

    if (!payouts || payouts.length === 0) {
      return
    }

    const eventsCol = $app.findCollectionByNameOrId('payment_events')

    for (let i = 0; i < payouts.length; i++) {
      const pay = payouts[i]
      const proId = pay.getString('pro')

      try {
        // Validação da Conta Pix do Profissional:
        // O pro precisa ter uma conta cadastrada E marcada como liberada (liberada = true)
        // Se não tiver conta liberada, o repasse fica retido até que a conta seja validada/liberada.
        let contaLiberada = false
        try {
          const contas = $app.findRecordsByFilter(
            'conta_pix',
            "pro = '" + proId + "' && liberada = true",
            '-created',
            1,
            0,
          )
          if (contas && contas.length > 0) {
            contaLiberada = true
          }
        } catch (_) {}

        if (!contaLiberada) {
          // Registra uma notificação/log no payment_events e pula a liberação deste payout
          const evRetido = new Record(eventsCol)
          evRetido.set('payout', pay.id)
          evRetido.set('tipo', 'retencao_conta_pendente')
          evRetido.set('valor', pay.getFloat('valor'))
          evRetido.set('data', nowIso)
          evRetido.set('metadata', {
            motivo: 'Payout retido: profissional não possui conta Pix validada/liberada',
            pro_id: proId,
          })
          $app.save(evRetido)
          continue
        }

        pay.set('status', 'pago')
        $app.save(pay)

        const ev = new Record(eventsCol)
        ev.set('payout', pay.id)
        ev.set('tipo', 'payout_liberado')
        ev.set('valor', pay.getFloat('valor'))
        ev.set('data', nowIso)
        ev.set('metadata', {
          motivo: 'Cron de liberação após período de garantia sem disputa aberta',
          data_liberacao: pay.getString('data_liberacao'),
          provedor: pay.getString('provedor'),
          conta_validada: true,
        })
        $app.save(ev)

        // Notificação por e-mail: Liberação de repasse
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

            const valorLiberado = pay.getFloat('valor') || 0
            const html = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <div style="background-color: #0f766e; color: #ffffff; padding: 16px; border-radius: 6px; text-align: center;">
                  <h2 style="margin: 0; font-size: 20px;">${senderName}</h2>
                  <p style="margin: 4px 0 0 0; font-size: 13px;">Repasse Financeiro Liberado</p>
                </div>
                <div style="padding: 20px 0; color: #334155; font-size: 14px; line-height: 1.6;">
                  <p>Olá, <strong>${proUser.getString('name') || 'Profissional'}</strong>!</p>
                  <p>Informamos que o seu repasse no valor de <strong style="color: #0f766e; font-size: 16px;">R$ ${valorLiberado.toFixed(2)}</strong> foi liberado com sucesso do escrow contábil.</p>
                  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin: 16px 0;">
                    <p style="margin: 0;"><strong>Referência:</strong> ${pay.getString('referencia') || pay.id}</p>
                    <p style="margin: 4px 0 0 0;"><strong>Destino:</strong> Conta Pix cadastrada e validada</p>
                    <p style="margin: 4px 0 0 0;"><strong>Status:</strong> Pago / Liberado</p>
                  </div>
                  <p style="color: #64748b; font-size: 12px;">Consulte o extrato completo na aba "Meus Repasses".</p>
                </div>
                <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; text-align: center;">
                  Enviado automaticamente por ${senderName}.
                </div>
              </div>
            `

            const mailer = new MailerMessage({
              from: { address: senderEmail, name: senderName },
              to: [{ address: proEmail }],
              subject: `[${senderName}] Repasse Liberado: R$ ${valorLiberado.toFixed(2)}`,
              html: html,
            })
            $app.newMailClient().send(mailer)
          }
        } catch (mailErr) {
          console.log('Erro ao enviar e-mail de liberação de payout:', mailErr)
        }
      } catch (errRecord) {
        console.log('Erro ao liberar payout individual ' + pay.id + ':', errRecord)
      }
    }
  } catch (err) {
    console.log('Erro geral no cron liberar_payouts_escrow (payouts):', err)
  }

  // =========================================================================
  // PROMOÇÃO AUTOMÁTICA DE PROS EM PERÍODO DE TESTE (status: teste -> ativo)
  // Idempotente: filtra role='pro' && status='teste' && periodo_teste_dias > 0
  // Verifica se (created + periodo_teste_dias) <= agora.
  // Atualiza status='ativo', grava registro/observação e envia e-mail ao pro.
  // =========================================================================
  try {
    const prosEmTeste = $app.findRecordsByFilter(
      'users',
      "role = 'pro' && status = 'teste' && periodo_teste_dias > 0",
      'created',
      200,
      0,
    )

    if (prosEmTeste && prosEmTeste.length > 0) {
      let senderName = 'Facilities Pro'
      let senderEmail = 'noreply@facilitiespro.com.br'
      let corPrimaria = '#0f766e'
      let plataformaUrl = 'https://app.housekeeping.com.br'

      try {
        const sList = $app.findRecordsByFilter('settings', 'id != ""', '-created', 1, 0)
        if (sList && sList.length > 0) {
          senderName = sList[0].getString('nome_empresa') || senderName
          corPrimaria = sList[0].getString('cor_primaria') || corPrimaria
          const empEmail = sList[0].getString('empresa_pix_chave')
          if (empEmail && empEmail.indexOf('@') > 0) {
            senderEmail = empEmail
          }
        }
      } catch (_) {}

      try {
        const siteEnv = $os.getenv('SITE_URL')
        if (siteEnv && siteEnv.indexOf('http') === 0 && siteEnv.indexOf('goskip.app') === -1) {
          plataformaUrl = siteEnv.replace(/\/$/, '')
        }
      } catch (_) {}

      const agoraMs = now.getTime()

      for (let pIdx = 0; pIdx < prosEmTeste.length; pIdx++) {
        const proRec = prosEmTeste[pIdx]
        const proId = proRec.id

        try {
          const diasTeste = proRec.getInt('periodo_teste_dias') || 0
          if (diasTeste <= 0) continue

          const createdStr = proRec.getString('created')
          if (!createdStr) continue

          // Parse data de criação do PocketBase (UTC ISO)
          const createdDate = new Date(createdStr.replace(' ', 'T'))
          const fimTesteMs = createdDate.getTime() + diasTeste * 24 * 60 * 60 * 1000

          if (fimTesteMs <= agoraMs) {
            // Formatar data de conclusão para registro no padrão pt-BR
            const diaFim = String(now.getDate()).padStart(2, '0')
            const mesFim = String(now.getMonth() + 1).padStart(2, '0')
            const anoFim = now.getFullYear()
            const horaFim = String(now.getHours()).padStart(2, '0')
            const minFim = String(now.getMinutes()).padStart(2, '0')
            const dataFimFormatada = `${diaFim}/${mesFim}/${anoFim} às ${horaFim}:${minFim}`
            const observacaoTexto = `Período de teste concluído em ${dataFimFormatada}`

            // Atualiza status para 'ativo' e anota observacao_teste
            proRec.set('status', 'ativo')
            proRec.set('observacao_teste', observacaoTexto)
            $app.save(proRec)

            console.log(
              `Pro promovido com sucesso de teste para ativo: ${proId} (${proRec.getString('name')}) - ${observacaoTexto}`,
            )

            // Envio de e-mail ao pro comunicando a promoção
            try {
              const proEmail = proRec.email()
              if (proEmail) {
                const proNome = proRec.getString('name') || 'Profissional'
                const htmlPro = `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
                    <div style="background-color: ${corPrimaria}; color: #ffffff; padding: 20px; border-radius: 8px; text-align: center;">
                      <h2 style="margin: 0; font-size: 20px; font-weight: 700;">${senderName}</h2>
                      <p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.95;">Parabéns! Período de Teste Concluído</p>
                    </div>
                    <div style="padding: 24px 4px; color: #334155; font-size: 15px; line-height: 1.6;">
                      <p style="margin-top: 0;">Olá, <strong>${proNome}</strong>!</p>
                      <p style="font-size: 16px; color: #0f766e; font-weight: 600;">
                        Seu período de teste foi concluído! A partir de agora você recebe o valor padrão das diárias dos postos.
                      </p>
                      <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 14px 16px; margin: 20px 0; border-radius: 6px;">
                        <p style="margin: 0; color: #166534; font-size: 14px;">
                          <strong>Status Atualizado:</strong> Ativo (Apto integral)
                        </p>
                        <p style="margin: 6px 0 0 0; color: #166534; font-size: 13px;">
                          Suas próximas convocações serão calculadas pelo motor de diárias conforme as regras e valores padrão de cada posto de trabalho.
                        </p>
                      </div>
                      <p style="font-size: 14px; color: #64748b;">
                        Acesse a plataforma para acompanhar suas convocações, escalas e repasses financeiros em tempo real.
                      </p>
                      <div style="text-align: center; margin: 28px 0;">
                        <a href="${plataformaUrl}/login" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: ${corPrimaria}; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                          Acessar Plataforma
                        </a>
                      </div>
                    </div>
                    <div style="border-top: 1px solid #e2e8f0; padding-top: 14px; font-size: 11px; color: #94a3b8; text-align: center;">
                      Mensagem automática gerada pelo sistema ${senderName}.
                    </div>
                  </div>
                `

                const mailerPro = new MailerMessage({
                  from: { address: senderEmail, name: senderName },
                  to: [{ address: proEmail }],
                  subject: `[${senderName}] Período de Teste Concluído! Você agora é Pro Ativo`,
                  html: htmlPro,
                })
                $app.newMailClient().send(mailerPro)
              }
            } catch (mailErr) {
              console.log(
                `Aviso ao enviar e-mail de conclusão de teste para pro ${proId}:`,
                mailErr,
              )
            }
          }
        } catch (errPro) {
          console.log(`Erro ao processar promoção de teste para pro individual ${proId}:`, errPro)
        }
      }
    }
  } catch (errTeste) {
    console.log('Erro geral na verificação de período de teste de pros:', errTeste)
  }
})
