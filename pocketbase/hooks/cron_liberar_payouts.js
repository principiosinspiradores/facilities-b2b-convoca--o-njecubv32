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
    console.log('Erro geral no cron liberar_payouts_escrow:', err)
  }
})
