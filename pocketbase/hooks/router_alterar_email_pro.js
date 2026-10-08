// pocketbase/hooks/router_alterar_email_pro.js
// Rota administrativa para alterar e-mail de profissional não verificado e reenviar convite de primeiro acesso

routerAdd('POST', '/backend/v1/admin/alterar-email-pro', (e) => {
  // 1. Validar autenticação e autorização (somente role = 'admin')
  const authRecord = e.auth
  if (!authRecord) {
    return e.json(403, { error: 'Acesso negado: autenticação necessária.' })
  }

  const callerRole = authRecord.getString('role')
  if (callerRole !== 'admin') {
    return e.json(403, {
      error: 'Acesso negado: apenas administradores podem alterar o e-mail de profissionais.',
    })
  }

  // 2. Extrair corpo da requisição (compatível com e.requestInfo().body e e.bindBody)
  let proId = ''
  let novoEmail = ''

  try {
    const info = e.requestInfo()
    if (info && info.body) {
      proId = (info.body.pro_id || info.body.proId || '').toString().trim()
      novoEmail = (info.body.novo_email || info.body.novoEmail || info.body.email || '')
        .toString()
        .trim()
    }
  } catch (_) {}

  if (!proId || !novoEmail) {
    try {
      const data = new DynamicModel({
        pro_id: '',
        proId: '',
        novo_email: '',
        novoEmail: '',
        email: '',
      })
      e.bindBody(data)
      if (!proId) proId = (data.pro_id || data.proId || '').toString().trim()
      if (!novoEmail)
        novoEmail = (data.novo_email || data.novoEmail || data.email || '').toString().trim()
    } catch (_) {}
  }

  if (!proId) {
    return e.json(400, { error: 'ID do profissional não informado.' })
  }

  novoEmail = novoEmail.toLowerCase()

  // 3. Validação de formato de e-mail
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!novoEmail || !emailRegex.test(novoEmail)) {
    return e.json(400, { error: 'Formato de e-mail inválido.' })
  }

  // 4. Buscar o profissional no banco
  let proRecord
  try {
    proRecord = $app.findRecordById('users', proId)
  } catch (_) {
    return e.json(404, { error: 'Profissional não encontrado.' })
  }

  const proRole = proRecord.getString('role')
  if (proRole !== 'pro') {
    return e.json(400, {
      error: 'Apenas usuários com perfil "pro" podem ter o e-mail alterado por esta rota.',
    })
  }

  // Se o profissional já estiver verificado, bloquear a alteração administrativa
  const jaVerificado = proRecord.verified()
  if (jaVerificado) {
    return e.json(400, {
      error:
        'Pro já verificado — a troca de e-mail deve ser feita pelo próprio pro via "Esqueci minha senha" ou confirmação direta.',
    })
  }

  const emailAntigo = proRecord.email()
  if (emailAntigo.toLowerCase() === novoEmail) {
    return e.json(400, {
      error: 'O novo e-mail informado é idêntico ao e-mail atual do profissional.',
    })
  }

  // 5. Validar unicidade do e-mail no banco
  try {
    const existing = $app.findAuthRecordByEmail('_pb_users_auth_', novoEmail)
    if (existing && existing.id !== proRecord.id) {
      return e.json(400, {
        error: 'Este endereço de e-mail já está em uso por outro usuário no sistema.',
      })
    }
  } catch (_) {
    // Não encontrado => e-mail livre, prossegue
  }

  // 6. Atualizar e-mail com privilégio do $app (superuser), manter verified=false e invalidar sessões antigas
  const adminName = authRecord.getString('name') || authRecord.email() || 'admin'
  const hoje = new Date()
  const dia = String(hoje.getDate()).padStart(2, '0')
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  const ano = hoje.getFullYear()
  const dataFormatada = dia + '/' + mes + '/' + ano

  const logMsg =
    'E-mail alterado de ' +
    emailAntigo +
    ' para ' +
    novoEmail +
    ' em ' +
    dataFormatada +
    ' por ' +
    adminName

  const obsAtual = proRecord.getString('observacao_teste') || ''
  const novaObs = obsAtual ? obsAtual + ' | ' + logMsg : logMsg

  try {
    proRecord.setEmail(novoEmail)
    proRecord.setVerified(false)
    proRecord.set('emailVisibility', true)
    proRecord.set('observacao_teste', novaObs)

    // Invalidar sessões anteriores gerando nova tokenKey
    try {
      proRecord.refreshTokenKey()
    } catch (tokenErr) {
      console.log('Aviso ao atualizar tokenKey:', tokenErr)
    }

    $app.save(proRecord)
  } catch (saveErr) {
    console.log('Erro ao salvar alteração de e-mail do pro:', saveErr)
    return e.json(500, {
      error:
        'Falha ao atualizar o e-mail no banco: ' +
        (saveErr ? saveErr.message : 'erro desconhecido'),
    })
  }

  // 7. Reenviar convite de primeiro acesso para o NOVO e-mail
  let emailEnviado = false
  let emailErroMsg = ''

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

    // Cores e configurações
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

    let conviteToken = ''
    try {
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
      console.log('Aviso ao gerar token de primeiro acesso 24h para novo e-mail:', tokErr)
    }

    const emailSubject = `[${senderName}] Crie seu acesso à plataforma`
    const buttonUrl = conviteToken
      ? `${plataformaUrl}/primeiro-acesso?token=${encodeURIComponent(conviteToken)}`
      : `${plataformaUrl}/login`

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
        <div style="background-color: ${corPrimaria}; color: #ffffff; padding: 22px; border-radius: 8px; text-align: center;">
          <h2 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">${senderName}</h2>
          <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.95;">Primeiro Acesso do Profissional</p>
        </div>
        <div style="padding: 24px 4px; color: #334155; font-size: 15px; line-height: 1.6;">
          <p style="margin-top: 0;">Olá, <strong>${proName}</strong>!</p>
          <p>Seu endereço de e-mail de acesso foi atualizado pela administração. <strong>Clique no botão abaixo para criar sua senha e ativar seu acesso à plataforma.</strong></p>
          <p style="font-size: 13px; color: #047857; background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 10px 14px; margin: 12px 0;"><strong>Atenção:</strong> Este link é válido por 24 horas e define sua senha e confirma automaticamente seu novo e-mail — nenhuma outra etapa é necessária.</p>
          <div style="background-color: #f8fafc; border-left: 4px solid ${corPrimaria}; padding: 16px; margin: 20px 0; border-radius: 6px;">
            <p style="margin: 0;"><strong>Novo e-mail de acesso:</strong> ${novoEmail}</p>
            <p style="margin: 8px 0 0 0;"><strong>Função(ões):</strong> ${funcoesTexto}</p>
            <p style="margin: 8px 0 0 0;"><strong>Status:</strong> Em avaliação / Gate de Documentação</p>
          </div>
          <p>Pela plataforma você acompanha suas convocações em tempo real, escalas confirmadas, registro de ponto e extrato de repasses.</p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${buttonUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: ${corPrimaria}; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              Criar meu acesso
            </a>
          </div>
          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 16px;">Este link de primeiro acesso é válido por 24 horas, individual e seguro. Caso expire, utilize a opção "Esqueci minha senha" na tela de login informando este novo e-mail ou peça o reenvio do convite à gestão.</p>
        </div>
        <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center;">
          Mensagem automática gerada pelo sistema ${senderName}.
        </div>
      </div>
    `

    const mailer = new MailerMessage({
      from: { address: senderEmail, name: senderName },
      to: [{ address: novoEmail }],
      subject: emailSubject,
      html: html,
    })

    $app.newMailClient().send(mailer)
    emailEnviado = true
  } catch (mailErr) {
    console.log('Erro ao reenviar convite para novo e-mail:', mailErr)
    emailErroMsg = mailErr ? mailErr.message : 'Falha ao enviar e-mail'
  }

  return e.json(200, {
    success: true,
    message: 'E-mail atualizado com sucesso e convite reenviado para o novo endereço.',
    pro_id: proRecord.id,
    email_anterior: emailAntigo,
    novo_email: novoEmail,
    verified: false,
    email_enviado: emailEnviado,
    email_erro: emailErroMsg || null,
  })
})
