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
      const tipoRemun = posto.getString('tipo_remuneracao_fixa')
      if (proFixoId && proFixoId === proId) {
        if (tipoRemun === 'mensal') {
          modeloRemuneracao = `Fixa Mensal (Contrato R$ ${(posto.getFloat('valor_remuneracao_fixa') || 0).toFixed(2)}/mês)`
        } else if (tipoRemun === 'por_hora') {
          modeloRemuneracao = `Fixa por Hora (R$ ${(posto.getFloat('valor_remuneracao_fixa') || 0).toFixed(2)}/h × ${posto.getInt('carga_horaria') || 8}h = R$ ${valDiaria.toFixed(2)})`
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
  } catch (err) {
    console.log('Erro geral ao enviar e-mail de nova convocação:', err)
  }
}, 'convocacoes')
