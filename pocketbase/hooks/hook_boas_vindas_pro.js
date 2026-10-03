// pocketbase/hooks/hook_boas_vindas_pro.js
onRecordAfterCreateSuccess((e) => {
  e.next()

  const record = e.record
  const role = record.getString('role')

  // Dispara apenas quando um usuário com perfil "pro" for cadastrado
  if (role !== 'pro') return

  try {
    const proEmail = record.email()
    if (!proEmail) return

    const proName = record.getString('name') || 'Profissional'
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

    const funcoesVal = record.get('funcoes')
    let funcoesTexto = 'Geral'
    if (funcoesVal) {
      if (Array.isArray(funcoesVal)) {
        funcoesTexto = funcoesVal.join(', ')
      } else if (typeof funcoesVal === 'string') {
        funcoesTexto = funcoesVal
      }
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="background-color: #0f766e; color: #ffffff; padding: 18px; border-radius: 6px; text-align: center;">
          <h2 style="margin: 0; font-size: 20px;">${senderName}</h2>
          <p style="margin: 6px 0 0 0; font-size: 13px;">Bem-vindo(a) à plataforma de facilities!</p>
        </div>
        <div style="padding: 24px 0; color: #334155; font-size: 14px; line-height: 1.6;">
          <p>Olá, <strong>${proName}</strong>!</p>
          <p>Seu cadastro foi realizado com sucesso em nossa base de profissionais parceiros pela equipe de gestão/RH.</p>
          <div style="background-color: #f8fafc; border-left: 4px solid #0f766e; padding: 14px; margin: 18px 0; border-radius: 4px;">
            <p style="margin: 0;"><strong>E-mail de acesso:</strong> ${proEmail}</p>
            <p style="margin: 6px 0 0 0;"><strong>Função(ões):</strong> ${funcoesTexto}</p>
            <p style="margin: 6px 0 0 0;"><strong>Status inicial:</strong> Em avaliação / Gate de Documentação</p>
          </div>
          <p>Seus documentos e conformidade serão verificados pelo RH para você receber convocações para escalas operacionais de trabalho.</p>
          <p style="font-size: 13px; color: #64748b;">Acesse a plataforma a qualquer momento para acompanhar suas convocações, escalas e repasses.</p>
        </div>
        <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; text-align: center;">
          Mensagem automática gerada pelo sistema ${senderName}.
        </div>
      </div>
    `

    const mailer = new MailerMessage({
      from: { address: senderEmail, name: senderName },
      to: [{ address: proEmail }],
      subject: `[${senderName}] Boas-vindas! Seu cadastro de Profissional foi realizado`,
      html: html,
    })

    $app.newMailClient().send(mailer)
  } catch (err) {
    console.log('Erro ao enviar e-mail de boas-vindas do pro:', err)
  }
}, 'users')
