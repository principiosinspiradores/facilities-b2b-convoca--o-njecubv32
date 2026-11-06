// pocketbase/hooks/router_marcar_verificado.js
// Rota administrativa para marcar verified=true em usuários criados com senha inicial por admin/empresa

routerAdd('POST', '/backend/v1/admin/marcar-verificado', (e) => {
  // 1. Validar autenticação e autorização (somente role = 'admin')
  const authRecord = e.auth
  if (!authRecord) {
    return e.json(403, { error: 'Acesso negado: autenticação necessária.' })
  }

  const callerRole = authRecord.getString('role')
  if (callerRole !== 'admin') {
    return e.json(403, {
      error: 'Acesso negado: apenas administradores podem marcar usuários como verificados.',
    })
  }

  // 2. Extrair corpo da requisição
  let userId = ''
  try {
    const info = e.requestInfo()
    if (info && info.body) {
      userId = (info.body.user_id || info.body.userId || info.body.id || '').toString().trim()
    }
  } catch (_) {}

  if (!userId) {
    try {
      const data = new DynamicModel({
        user_id: '',
        userId: '',
        id: '',
      })
      e.bindBody(data)
      userId = (data.user_id || data.userId || data.id || '').toString().trim()
    } catch (_) {}
  }

  if (!userId) {
    return e.json(400, { error: 'ID do usuário não informado.' })
  }

  // 3. Buscar usuário no banco
  let userRecord
  try {
    userRecord = $app.findRecordById('users', userId)
  } catch (_) {
    return e.json(404, { error: 'Usuário não encontrado.' })
  }

  // 4. Executar limpeza e marcação via contexto de sistema ($app)
  try {
    userRecord.setVerified(true)
    $app.save(userRecord)
  } catch (err) {
    console.log('Erro ao marcar usuário verificado:', err)
    return e.json(500, {
      error: 'Falha ao marcar usuário como verificado: ' + (err ? err.message : String(err)),
    })
  }

  return e.json(200, {
    success: true,
    user_id: userRecord.id,
    verified: true,
  })
})
