// pocketbase/hooks/router_debug_leitura.js
// ARQUIVO TEMPORÁRIO DE DIAGNÓSTICO — apagado antes do commit. NÃO COMMITAR.
// (a) Lê o resultado completo do diagnóstico gravado em users.observacao_teste
// (email debug-senha-result@debug.invalido).
// (b) Executa a limpeza dos resíduos de teste em users (registro de resultado + usuários temporários).
// (c) Reexecuta o teste HTTP como admin logado (auth-with-password), replicando o payload da UI,
//     para capturar o erro real de campo devolvido pela API.

routerAdd('GET', '/backend/v1/debug-senha-result', (e) => {
  try {
    const rec = $app.findFirstRecordByFilter('users', "email = 'debug-senha-result@debug.invalido'")
    return e.json(200, { observacao: rec.getString('observacao_teste') })
  } catch (err) {
    return e.json(404, { error: String(err) })
  }
})

routerAdd('GET', '/backend/v1/debug-senha-limpeza', (e) => {
  const apagados = []
  const erros = []
  const filtros = [
    "email = 'debug-senha-result@debug.invalido'",
    "email ~ 'debug-senha-t-'",
    "email ~ 'debug-senha-h-'",
    "email ~ 'debug-senha-re-'",
  ]
  for (let i = 0; i < filtros.length; i++) {
    try {
      const recs = $app.findRecordsByFilter('users', filtros[i], '-created', 100, 0)
      for (let j = 0; j < recs.length; j++) {
        try {
          apagados.push(recs[j].email() + ' (' + recs[j].id + ')')
          $app.delete(recs[j])
        } catch (delErr) {
          erros.push('delete ' + recs[j].id + ': ' + String(delErr))
        }
      }
    } catch (findErr) {
      erros.push('find ' + filtros[i] + ': ' + String(findErr))
    }
  }
  return e.json(200, { apagados: apagados, erros: erros })
})

routerAdd('GET', '/backend/v1/debug-senha-reteste', (e) => {
  const saida = { tokenErro: '', loginErro: '', status: 0, body: {} }

  let adminEmail = ''
  try {
    const admins = $app.findRecordsByFilter('users', "role = 'admin'", '-created', 1, 0)
    if (admins && admins.length > 0) {
      adminEmail = admins[0].email()
    }
  } catch (e1) {
    saida.tokenErro = String(e1)
  }

  if (adminEmail) {
    try {
      const loginResp = $http.send({
        url: $app.settings().meta.appURL + '/api/collections/users/auth-with-password',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: adminEmail, password: 'Debug-Senha-2026' }),
      })
      saida.loginStatus = loginResp.statusCode
      const loginBody = loginResp.json || {}
      const token = loginBody.token || ''
      if (!token) {
        saida.loginErro = JSON.stringify(loginBody).substring(0, 300)
        return e.json(200, saida)
      }

      const payload = {
        email:
          'debug-senha-re-' +
          Date.now() +
          '-' +
          Math.floor(Math.random() * 1000) +
          '@debug.invalido',
        emailVisibility: true,
        password: '15031985',
        passwordConfirm: '15031985',
        name: 'Debug Temporário',
        role: 'empresa',
        status: 'ativo',
        cpf: '79864521000',
      }
      const resp = $http.send({
        url: $app.settings().meta.appURL + '/api/collections/users/records',
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      saida.status = resp.statusCode
      try {
        saida.body = resp.json
      } catch (_) {}
      const criadoId = saida.body && saida.body.id
      if (criadoId) {
        try {
          $app.delete($app.findRecordById('users', criadoId))
          saida.removido = true
        } catch (er) {
          saida.erroRemocao = String(er)
        }
      }
    } catch (err) {
      saida.excecao = String(err)
    }
  }

  return e.json(200, saida)
})
