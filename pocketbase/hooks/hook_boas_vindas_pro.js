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

    // Resolução robusta das funções:
    // O campo 'funcoes' no PocketBase (JSON) pode vir como:
    // 1) Array de strings (ex: ["Camareira", "Porteiro"] ou ["id1", "id2"])
    // 2) String JSON ou string simples
    // 3) Uint8Array/bytes se convertido pelo driver Goja (ex: [91, 34, 67, ...])
    let rawFuncoes = record.get('funcoes')

    // Se vier como string de bytes/números ou se for string JSON
    if (typeof rawFuncoes === 'string') {
      try {
        rawFuncoes = JSON.parse(rawFuncoes)
      } catch (_) {}
    }

    // Se for buffer / array de números (ex: [91, 34, 67, ...])
    if (Array.isArray(rawFuncoes) && rawFuncoes.length > 0 && typeof rawFuncoes[0] === 'number') {
      try {
        let str = ''
        for (let i = 0; i < rawFuncoes.length; i++) {
          str += String.fromCharCode(rawFuncoes[i])
        }
        rawFuncoes = JSON.parse(str)
      } catch (_) {}
    }

    let funcoesArray = []
    if (Array.isArray(rawFuncoes)) {
      funcoesArray = rawFuncoes
    } else if (typeof rawFuncoes === 'string' && rawFuncoes.trim() !== '') {
      funcoesArray = [rawFuncoes.trim()]
    }

    // Resolver cada item contra a coleção 'funcoes' (por ID ou se já for o nome)
    const nomesResolvidos = []
    for (let fIdx = 0; fIdx < funcoesArray.length; fIdx++) {
      const item = funcoesArray[fIdx]
      if (!item || typeof item !== 'string') continue
      const valStr = item.trim()
      if (!valStr) continue

      let nomeEncontrado = ''
      // Tentar buscar por ID na coleção funcoes
      try {
        const funcaoRec = $app.findRecordById('funcoes', valStr)
        if (funcaoRec) {
          nomeEncontrado = funcaoRec.getString('nome')
        }
      } catch (_) {}

      // Se não achou por ID, tentar buscar por nome exato na coleção
      if (!nomeEncontrado) {
        try {
          const recPorNome = $app.findFirstRecordByData('funcoes', 'nome', valStr)
          if (recPorNome) {
            nomeEncontrado = recPorNome.getString('nome')
          }
        } catch (_) {}
      }

      // Se não encontrou no banco, usar o próprio valor string se for legível
      if (!nomeEncontrado) {
        nomeEncontrado = valStr
      }

      if (nomeEncontrado && nomesResolvidos.indexOf(nomeEncontrado) === -1) {
        nomesResolvidos.push(nomeEncontrado)
      }
    }

    const funcoesTexto = nomesResolvidos.length > 0 ? nomesResolvidos.join(', ') : '—'

    // Cores e configurações da empresa (white label)
    let corPrimaria = '#0f766e'
    let corSecundaria = '#134e4a'
    try {
      const sList = $app.findRecordsByFilter('settings', 'id != ""', '-created', 1, 0)
      if (sList && sList.length > 0) {
        corPrimaria = sList[0].getString('cor_primaria') || corPrimaria
        corSecundaria = sList[0].getString('cor_secundaria') || corSecundaria
      }
    } catch (_) {}

    const plataformaUrl = 'https://facilities-b2b-convocacao-ae810.goskip.app'

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
        <div style="background-color: ${corPrimaria}; color: #ffffff; padding: 22px; border-radius: 8px; text-align: center;">
          <h2 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">${senderName}</h2>
          <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.95;">Bem-vindo(a) à plataforma de facilities!</p>
        </div>
        <div style="padding: 24px 4px; color: #334155; font-size: 15px; line-height: 1.6;">
          <p style="margin-top: 0;">Olá, <strong>${proName}</strong>!</p>
          <p>Seu cadastro foi realizado com sucesso em nossa base de profissionais parceiros pela equipe de gestão/RH.</p>
          <div style="background-color: #f8fafc; border-left: 4px solid ${corPrimaria}; padding: 16px; margin: 20px 0; border-radius: 6px;">
            <p style="margin: 0;"><strong>E-mail de acesso:</strong> ${proEmail}</p>
            <p style="margin: 8px 0 0 0;"><strong>Função(ões):</strong> ${funcoesTexto}</p>
            <p style="margin: 8px 0 0 0;"><strong>Status inicial:</strong> Em avaliação / Gate de Documentação</p>
          </div>
          <p>Seus documentos e conformidade serão verificados pelo RH para que você seja habilitado(a) e comece a receber convocações para escalas operacionais de trabalho.</p>
          <p style="margin-bottom: 24px; font-size: 14px; color: #64748b;">Acesse a plataforma a qualquer momento para acompanhar suas convocações, escalas confirmadas e extrato de repasses.</p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${plataformaUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: ${corPrimaria}; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              Acessar a plataforma
            </a>
          </div>
          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 16px;">
            Caso seja o seu primeiro acesso, verifique também o e-mail de confirmação para cadastrar sua senha.
          </p>
        </div>
        <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center;">
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
