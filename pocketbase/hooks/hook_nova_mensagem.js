// pocketbase/hooks/hook_nova_mensagem.js
onRecordAfterCreateSuccess((e) => {
  e.next()

  const record = e.record
  const remetenteId = record.getString('remetente')
  const conversaId = record.getString('conversa')
  const texto = record.getString('texto') || ''
  const destinatarioTipo = record.getString('destinatario_tipo')

  try {
    // 1. Obter informações da conversa
    const conversa = $app.findRecordById('mensagens_conversas', conversaId)
    const proId = conversa.getString('pro')
    const tipoConversa = conversa.getString('tipo')
    const tituloContexto = conversa.getString('titulo_contexto') || 'Atendimento'

    // 2. Obter remetente
    const remetenteUser = $app.findRecordById('users', remetenteId)
    const remetenteNome = remetenteUser.getString('name') || remetenteUser.email() || 'Usuário'
    const remetenteRole = remetenteUser.getString('role')

    // 3. Obter configurações White Label do sistema (settings)
    let senderName = 'Facilities Pro'
    let senderEmail = 'noreply@facilitiespro.com.br'
    let corPrimaria = '#0f766e'

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

    // 4. Determinar destinatário(s) do e-mail de notificação
    // Se o remetente for 'pro', a notificação vai para a equipe da empresa (destinatário da mensagem)
    // Se o remetente for 'empresa' ou 'admin', a notificação vai para o profissional (pro)
    const emailsDestino = []

    if (remetenteRole === 'pro') {
      // Notificar colaboradores com papel empresa ou admin
      try {
        const empresaUsers = $app.findRecordsByFilter(
          'users',
          'role = "empresa" && status = "ativo"',
          '-created',
          5,
          0,
        )
        for (let i = 0; i < empresaUsers.length; i++) {
          const em = empresaUsers[i].email()
          if (em && emailsDestino.indexOf(em) === -1) {
            emailsDestino.push(em)
          }
        }
      } catch (errEmp) {
        console.log('Erro ao buscar colaboradores da empresa no hook de mensagem:', errEmp)
      }
    } else {
      // Remetente é empresa ou admin -> notificar o profissional
      try {
        const proUser = $app.findRecordById('users', proId)
        const pEmail = proUser.email()
        if (pEmail && emailsDestino.indexOf(pEmail) === -1) {
          emailsDestino.push(pEmail)
        }
      } catch (errPro) {
        console.log('Erro ao buscar pro no hook de mensagem:', errPro)
      }
    }

    if (emailsDestino.length === 0) return

    // Resumo de texto da mensagem (máx 180 chars para prévia no e-mail)
    const textoResumo = texto.length > 180 ? texto.substring(0, 180) + '...' : texto

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="background-color: ${corPrimaria}; color: #ffffff; padding: 18px 20px; border-radius: 8px; text-align: center;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">${senderName}</h2>
          <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">Mensagem Interna Recebida</p>
        </div>

        <div style="padding: 24px 4px; color: #1e293b; font-size: 14px; line-height: 1.6;">
          <p style="margin-top: 0; font-size: 15px;">
            Você recebeu uma nova mensagem interna de <strong>${remetenteNome}</strong>.
          </p>

          <div style="background-color: #f8fafc; border-left: 4px solid ${corPrimaria}; padding: 14px 16px; margin: 18px 0; border-radius: 0 8px 8px 0;">
            <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 600; margin-bottom: 6px;">
              ${tipoConversa === 'contextual' ? 'Turno / Escala: ' + tituloContexto : 'Canal Direto: ' + tituloContexto}
            </div>
            <div style="font-size: 14px; color: #334155; font-style: italic; white-space: pre-wrap;">
              "${textoResumo}"
            </div>
          </div>

          <p style="font-size: 13px; color: #64748b; margin-bottom: 0;">
            Esta mensagem foi enviada pelo chat interno do aplicativo Facilities B2B. Acesse o painel para responder em tempo real.
          </p>
        </div>

        <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center;">
          Notificação automática enviada por <strong>${senderName}</strong>. Não responda diretamente a este e-mail.
        </div>
      </div>
    `

    // Enviar notificação por e-mail para os destinatários elegíveis
    for (let k = 0; k < emailsDestino.length; k++) {
      try {
        const mailer = new MailerMessage({
          from: { address: senderEmail, name: senderName },
          to: [{ address: emailsDestino[k] }],
          subject: `[${senderName}] Nova mensagem de ${remetenteNome} (${tituloContexto})`,
          html: html,
        })
        $app.newMailClient().send(mailer)
      } catch (errSend) {
        console.log(
          'Erro ao disparar e-mail no hook_nova_mensagem para ' + emailsDestino[k] + ':',
          errSend,
        )
      }
    }
  } catch (errGeral) {
    console.log('Erro geral no hook_nova_mensagem:', errGeral)
  }
}, 'mensagens_mensagens')
