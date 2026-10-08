// pocketbase/hooks/router_primeiro_acesso.js
// Rota para validar o token de 24h e definir a senha de primeiro acesso do profissional

routerAdd('POST', '/backend/v1/auth/primeiro-acesso', (e) => {
  // 1. Extrair token e senhas do corpo da requisição
  let token = ''
  let password = ''
  let passwordConfirm = ''

  try {
    const info = e.requestInfo()
    if (info && info.body) {
      token = (info.body.token || '').toString().trim()
      password = (info.body.password || '').toString()
      passwordConfirm = (info.body.passwordConfirm || info.body.password_confirm || '').toString()
    }
  } catch (_) {}

  if (!token || !password) {
    try {
      const data = new DynamicModel({
        token: '',
        password: '',
        passwordConfirm: '',
        password_confirm: '',
      })
      e.bindBody(data)
      if (!token) token = (data.token || '').toString().trim()
      if (!password) password = (data.password || '').toString()
      if (!passwordConfirm)
        passwordConfirm = (data.passwordConfirm || data.password_confirm || '').toString()
    } catch (_) {}
  }

  // 2. Validações básicas de payload
  if (!token) {
    return e.json(400, {
      code: 'TOKEN_MISSING',
      error: 'Token de primeiro acesso não informado.',
    })
  }

  if (!password || password.length < 8) {
    return e.json(400, {
      code: 'PASSWORD_TOO_SHORT',
      error: 'A senha deve conter no mínimo 8 caracteres.',
    })
  }

  if (passwordConfirm && password !== passwordConfirm) {
    return e.json(400, {
      code: 'PASSWORD_MISMATCH',
      error: 'A confirmação de senha não coincide com a nova senha.',
    })
  }

  // 3. Buscar convite no banco
  let conviteRec
  try {
    conviteRec = $app.findFirstRecordByData('convites_acesso', 'token', token)
  } catch (_) {
    return e.json(400, {
      code: 'TOKEN_INVALID',
      error: 'Link de primeiro acesso inválido ou inexistente.',
    })
  }

  // 4. Verificar se já foi usado
  const jaUsado = conviteRec.getBool('usado')
  if (jaUsado) {
    return e.json(400, {
      code: 'TOKEN_ALREADY_USED',
      error: 'Este link de primeiro acesso já foi utilizado.',
    })
  }

  // 5. Verificar expiração
  const expiresAtVal = conviteRec.getString('expires_at')
  if (!expiresAtVal) {
    return e.json(400, {
      code: 'TOKEN_EXPIRED',
      error: 'Link de primeiro acesso expirado.',
    })
  }

  const expDate = new Date(expiresAtVal.replace(' ', 'T'))
  const now = new Date()
  if (now.getTime() > expDate.getTime()) {
    return e.json(400, {
      code: 'TOKEN_EXPIRED',
      error:
        'Este link de primeiro acesso expirou. O link possui validade de 24 horas. Use a opção "Esqueci minha senha" na tela de login ou peça o reenvio do convite à gestão.',
    })
  }

  // 6. Buscar o usuário associado
  const userId = conviteRec.getString('user')
  if (!userId) {
    return e.json(400, {
      code: 'USER_NOT_FOUND',
      error: 'Usuário associado ao convite não encontrado.',
    })
  }

  let userRec
  try {
    userRec = $app.findRecordById('users', userId)
  } catch (_) {
    return e.json(404, {
      code: 'USER_NOT_FOUND',
      error: 'Usuário não encontrado no sistema.',
    })
  }

  // 7. Atualizar senha do usuário, marcar verified = true, emailVisibility = true
  try {
    userRec.setPassword(password)
    userRec.setVerified(true)
    userRec.set('emailVisibility', true)
    $app.save(userRec)
  } catch (userSaveErr) {
    console.log('Erro ao atualizar usuário no primeiro acesso:', userSaveErr)
    return e.json(500, {
      code: 'USER_SAVE_ERROR',
      error:
        'Falha ao salvar nova senha do usuário: ' + (userSaveErr ? userSaveErr.message : 'erro'),
    })
  }

  // 8. Marcar o convite como usado
  try {
    conviteRec.set('usado', true)
    $app.save(conviteRec)
  } catch (convSaveErr) {
    console.log('Aviso ao marcar convite como usado:', convSaveErr)
  }

  return e.json(200, {
    success: true,
    message: 'Senha criada com sucesso e conta ativada! Faça login com seu e-mail e senha.',
    email: userRec.email(),
  })
})
