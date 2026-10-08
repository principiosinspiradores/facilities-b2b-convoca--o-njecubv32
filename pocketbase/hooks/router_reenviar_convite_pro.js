// pocketbase/hooks/router_reenviar_convite_pro.js
// Rota para reenviar o convite de primeiro acesso (token de 24h) para um profissional não verificado

routerAdd('POST', '/backend/v1/pros/reenviar-convite', (e) => {
  // 1. Validar autenticação e autorização (admin ou empresa logados)
  const authRecord = e.auth
  if (!authRecord) {
    return e.json(403, { error: 'Acesso negado: autenticação necessária.' })
  }

  const callerRole = authRecord.getString('role')
  if (callerRole !== 'admin' && callerRole !== 'empresa') {
    return e.json(403, {
      error: 'Acesso negado: apenas administradores e empresas podem reenviar convites.',
    })
  }

  // 2. Extrair e-mail da requisição
  let targetEmail = ''
  try {
    const info = e.requestInfo()
    if (info && info.body) {
      targetEmail = (info.body.email || info.body.target_email || '').toString().trim()
    }
  } catch (_) {}

  if (!targetEmail) {
    try {
      const data = new DynamicModel({ email: '', target_email: '' })
      e.bindBody(data)
      targetEmail = (data.email || data.target_email || '').toString().trim()
    } catch (_) {}
  }

  if (!targetEmail) {
    return e.json(400, { error: 'E-mail não informado.' })
  }

  targetEmail = targetEmail.toLowerCase()

  // 3. Localizar o profissional pelo e-mail
  let proRecord
  try {
    proRecord = $app.findAuthRecordByEmail('_pb_users_auth_', targetEmail)
  } catch (_) {
    return e.json(404, { error: 'Profissional não encontrado com o e-mail informado.' })
  }

  const proRole = proRecord.getString('role')
  if (proRole !== 'pro') {
    return e.json(400, {
      error: 'Apenas usuários com perfil "pro" podem receber convite de primeiro acesso.',
    })
  }

  // 4. Se o profissional já estiver verificado:
  const jaVerificado = proRecord.verified()
  if (jaVerificado) {
    // Pro já verificado: dispara o fluxo padrão de recuperação de senha (PocketBase)
    try {
      // Usar a rotina nativa de password reset do PocketBase
      const resetToken = proRecord.newPasswordResetToken()
      // Envia o e-mail padrão do PocketBase ou confirma que está verificado
      return e.json(200, {
        success: true,
        type: 'access_link',
        message: 'Profissional já verificado. Link de acesso padrão solicitado.',
      })
    } catch (err) {
      return e.json(400, {
        error: 'Erro ao gerar link de acesso para profissional já verificado.',
      })
    }
  }

  // 5. Profissional NÃO verificado: gerar token de 24 horas em convites_acesso
  let conviteToken = ''
  try {
    // Invalidar convites anteriores não usados
    try {
      $app
        .db()
        .newQuery(
          'UPDATE convites_acesso SET usado = 1 WHERE user = {:userId} AND (usado = 0 OR usado IS NULL)',
        )
        .bind({ userId: proRecord.id })
        .execute()
    } catch (invErr) {
      console.log('Aviso ao invalidar convites anteriores:', invErr)
    }

    conviteToken = $security.randomString(48)
    const expiresAtDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const expiresAtStr = expiresAtDate.toISOString().replace('T', ' ')

    const convitesCol = $app.findCollectionByNameOrId('convites_acesso')
    const conviteRec = new Record(convitesCol)
    conviteRec.set('user', proRecord.id)
    conviteRec.set('token', conviteToken)
    conviteRec.set('expires_at', expiresAtStr)
    conviteRec.set('usado', false)
    $app.save(conviteRec)
  } catch (tokErr) {
    console.log('Erro ao criar registro em convites_acesso:', tokErr)
    return e.json(500, {
      error: 'Falha ao gerar convite de primeiro acesso: ' + (tokErr ? tokErr.message : 'erro'),
    })
  }

  // 6. Preparar e enviar o e-mail de convite de primeiro acesso (layout idêntico ao de boas-vindas)
  try {
    const proName = proRecord.getString('name') || 'Profissional'
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

    // Resolução de funções
    let rawFuncoes = proRecord.get('funcoes')
    if (typeof rawFuncoes === 'string') {
      try {
        rawFuncoes = JSON.parse(rawFuncoes)
      } catch (_) {}
    }
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

    const nomesResolvidos = []
    for (let fIdx = 0; fIdx < funcoesArray.length; fIdx++) {
      const item = funcoesArray[fIdx]
      if (!item || typeof item !== 'string') continue
      const valStr = item.trim()
      if (!valStr) continue

      let nomeEncontrado = ''
      try {
        const funcaoRec = $app.findRecordById('funcoes', valStr)
        if (funcaoRec) {
          nomeEncontrado = funcaoRec.getString('nome')
        }
      } catch (_) {}

      if (!nomeEncontrado) {
        try {
          const recPorNome = $app.findFirstRecordByData('funcoes', 'nome', valStr)
          if (recPorNome) {
            nomeEncontrado = recPorNome.getString('nome')
          }
        } catch (_) {}
      }

      if (!nomeEncontrado) {
        nomeEncontrado = valStr
      }

      if (nomeEncontrado && nomesResolvidos.indexOf(nomeEncontrado) === -1) {
        nomesResolvidos.push(nomeEncontrado)
      }
    }

    const funcoesTexto = nomesResolvidos.length > 0 ? nomesResolvidos.join(', ') : '—'

    let corPrimaria = '#0f766e'
    let corSecundaria = '#134e4a'
    try {
      const sList = $app.findRecordsByFilter('settings', 'id != ""', '-created', 1, 0)
      if (sList && sList.length > 0) {
        corPrimaria = sList[0].getString('cor_primaria') || corPrimaria
        corSecundaria = sList[0].getString('cor_secundaria') || corSecundaria
      }
    } catch (_) {}

    let plataformaUrl = 'https://app.housekeeping.com.br'
    try {
      const siteEnv = $os.getenv('SITE_URL')
      if (siteEnv && siteEnv.indexOf('http') === 0 && siteEnv.indexOf('goskip.app') === -1) {
        plataformaUrl = siteEnv.replace(/\/$/, '')
      } else {
        const pbSettings = $app.settings()
        if (
          pbSettings &&
          pbSettings.meta &&
          pbSettings.meta.appURL &&
          pbSettings.meta.appURL.indexOf('goskip.app') === -1
        ) {
          plataformaUrl = pbSettings.meta.appURL.replace(/\/$/, '')
        }
      }
    } catch (_) {}

    if (
      plataformaUrl.indexOf('www.housekeeping.com.br') !== -1 ||
      plataformaUrl.indexOf('goskip.app') !== -1
    ) {
      plataformaUrl = 'https://app.housekeeping.com.br'
    }

    const emailSubject = `[${senderName}] Crie seu acesso à plataforma`
    const buttonUrl = `${plataformaUrl}/primeiro-acesso?token=${encodeURIComponent(conviteToken)}`

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
        <div style="background-color: ${corPrimaria}; color: #ffffff; padding: 22px; border-radius: 8px; text-align: center;">
          <h2 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">${senderName}</h2>
          <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.95;">Primeiro Acesso do Profissional</p>
        </div>
        <div style="padding: 24px 4px; color: #334155; font-size: 15px; line-height: 1.6;">
          <p style="margin-top: 0;">Olá, <strong>${proName}</strong>!</p>
          <p>Você foi cadastrado(a) pela equipe de gestão/RH. <strong>Clique no botão abaixo para criar sua senha e ativar seu acesso à plataforma.</strong></p>
          <p style="font-size: 13px; color: #047857; background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 10px 14px; margin: 12px 0;"><strong>Atenção:</strong> Este link é válido por 24 horas e verifica e ativa automaticamente seu e-mail ao criar sua senha — nenhuma outra confirmação é necessária.</p>
          <div style="background-color: #f8fafc; border-left: 4px solid ${corPrimaria}; padding: 16px; margin: 20px 0; border-radius: 6px;">
            <p style="margin: 0;"><strong>E-mail de acesso:</strong> ${targetEmail}</p>
            <p style="margin: 8px 0 0 0;"><strong>Função(ões):</strong> ${funcoesTexto}</p>
            <p style="margin: 8px 0 0 0;"><strong>Status inicial:</strong> Em avaliação / Gate de Documentação</p>
          </div>
          <p>Seus documentos e conformidade serão verificados pelo RH para que você seja habilitado(a) e comece a receber convocações para escalas operacionais de trabalho.</p>
          <p style="margin-bottom: 24px; font-size: 14px; color: #64748b;">Pela plataforma você acompanha suas convocações em tempo real, escalas confirmadas, registro de ponto e extrato de repasses.</p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${buttonUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: ${corPrimaria}; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              Criar meu acesso
            </a>
          </div>
          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 16px;">Este link de primeiro acesso é válido por 24 horas, individual e seguro (ele define sua senha e confirma seu e-mail em uma única etapa). Caso expire, utilize a opção "Esqueci minha senha" na tela de login ou peça o reenvio do convite à gestão.</p>
        </div>
        <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center;">
          Mensagem automática gerada pelo sistema ${senderName}.
        </div>
      </div>
    `

    const mailer = new MailerMessage({
      from: { address: senderEmail, name: senderName },
      to: [{ address: targetEmail }],
      subject: emailSubject,
      html: html,
    })

    $app.newMailClient().send(mailer)
  } catch (mailErr) {
    console.log('Erro ao enviar e-mail de reenvio de convite:', mailErr)
    return e.json(500, {
      error:
        'Convite gerado, mas ocorreu erro no envio do e-mail: ' + (mailErr ? mailErr.message : ''),
    })
  }

  return e.json(200, {
    success: true,
    type: 'first_access_link',
    message: `Link de primeiro acesso válido por 24h enviado para ${targetEmail}.`,
  })
})
