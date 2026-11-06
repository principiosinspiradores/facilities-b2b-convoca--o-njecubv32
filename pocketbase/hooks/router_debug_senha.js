// pocketbase/hooks/router_debug_senha.js
// ARQUIVO TEMPORÁRIO DE DIAGNÓSTICO — apagado antes do commit. NÃO COMMITAR.
// Cron a cada minuto com guarda de execução única: grava o resultado do diagnóstico
// no campo observacao_teste de um usuário de teste (email debug-senha-result@debug.invalido).
// Testes: (a) dump da política do campo password da coleção users;
//         (b) criação em contexto superuser com senha de 8 dígitos;
//         (c) criação via API HTTP real (como admin logado) replicando o payload da UI,
//             com senha curta e com senha forte, para isolar política de senha x campo verified.

cronAdd('debug_senha_uma_vez', '* * * * *', () => {
  try {
    let jaExiste = null
    try {
      jaExiste = $app.findFirstRecordByFilter(
        'users',
        "email = 'debug-senha-result@debug.invalido'",
      )
    } catch (_) {
      jaExiste = null
    }
    if (jaExiste) return

    function serializarErro(err) {
      const out = {}
      try {
        out.string = String(err)
      } catch (_) {}
      try {
        out.message = err.message
      } catch (_) {}
      try {
        out.data = err.data
      } catch (_) {}
      return out
    }

    function cpfValido(base9) {
      let soma = 0
      for (let i = 0; i < 9; i++) soma += parseInt(base9[i], 10) * (10 - i)
      let d1 = (soma * 10) % 11
      if (d1 === 10) d1 = 0
      let soma2 = 0
      const base10 = base9 + String(d1)
      for (let j = 0; j < 10; j++) soma2 += parseInt(base10[j], 10) * (11 - j)
      let d2 = (soma2 * 10) % 11
      if (d2 === 10) d2 = 0
      return base9 + String(d1) + String(d2)
    }

    function testeSuperuser(nome, senha, base9, comVerified) {
      const saida = { teste: nome, senha: senha, verified: comVerified }
      let rec = null
      try {
        const col = $app.findCollectionByNameOrId('users')
        rec = new Record(col)
        rec.set(
          'email',
          'debug-senha-t-' +
            Date.now() +
            '-' +
            Math.floor(Math.random() * 1000) +
            '@debug.invalido',
        )
        rec.set('emailVisibility', true)
        rec.set('name', 'Debug Temporário')
        rec.set('role', 'empresa')
        rec.set('status', 'ativo')
        rec.set('cpf', cpfValido(base9))
        if (comVerified) rec.set('verified', true)
        rec.set('password', senha)
        rec.set('passwordConfirm', senha)
        $app.save(rec)
        saida.ok = true
        saida.id = rec.id
      } catch (err) {
        saida.ok = false
        saida.erro = serializarErro(err)
      }
      if (rec && rec.id) {
        try {
          $app.delete(rec)
          saida.removido = true
        } catch (e) {
          saida.erroRemocao = String(e)
        }
      }
      return saida
    }

    function testeHttp(nome, senha, comVerified, base9) {
      const saida = { teste: nome, senha: senha, verified: comVerified }
      try {
        let token = ''
        try {
          const admin = $app.findFirstRecordByFilter('users', "role = 'admin'", '')
          token = admin.authToken()
        } catch (e1) {
          saida.tokenErro = String(e1)
        }
        if (token) {
          const payload = {
            email:
              'debug-senha-h-' +
              Date.now() +
              '-' +
              Math.floor(Math.random() * 1000) +
              '@debug.invalido',
            emailVisibility: true,
            password: senha,
            passwordConfirm: senha,
            name: 'Debug Temporário',
            role: 'empresa',
            status: 'ativo',
            cpf: cpfValido(base9),
          }
          if (comVerified) payload.verified = true
          saida.payloadEnviado = payload
          const resp = $http.send({
            url: 'https://app.housekeeping.com.br/api/collections/users/records',
            method: 'POST',
            headers: { Authorization: token },
            body: JSON.stringify(payload),
          })
          saida.status = resp.status
          try {
            saida.body = resp.json
          } catch (_) {}
          const criadoId = saida.body && saida.body.id
          if (criadoId) {
            try {
              $app.delete($app.findRecordById('users', criadoId))
              saida.removido = true
            } catch (e) {
              saida.erroRemocao = String(e)
            }
          }
        }
      } catch (err) {
        saida.excecao = serializarErro(err)
      }
      return saida
    }

    const resultados = []

    // 1. Configuração do campo password e do método de autenticação por senha
    try {
      const col = $app.findCollectionByNameOrId('users')
      const dump = {}
      try {
        const f = col.fields.getByName('password')
        const d = {}
        try {
          d.min = f.min
        } catch (e) {}
        try {
          d.max = f.max
        } catch (e) {}
        try {
          d.pattern = f.pattern
        } catch (e) {}
        try {
          d.required = f.required
        } catch (e) {}
        dump.passwordField = d
      } catch (e) {
        dump.passwordFieldErro = String(e)
      }
      try {
        dump.passwordAuth = JSON.parse(JSON.stringify(col.passwordAuth))
      } catch (e) {
        dump.passwordAuthErro = String(e)
      }
      resultados.push({ tag: 'config', dump: dump })
    } catch (e) {
      resultados.push({ tag: 'config-erro', erro: String(e) })
    }

    // 2. Superuser: senha de 8 dígitos (padrão sugerido pela UI)
    resultados.push(testeSuperuser('su-8digitos', '15031985', '798645210', false))
    // 3. Superuser: senha forte de 10 caracteres
    resultados.push(testeSuperuser('su-forte', 'Abcdefgh12', '612852470', false))

    // 4. API real como admin: senha curta + verified true (payload da UI de empresa)
    resultados.push(testeHttp('api-curta-verified', '15031985', true, '798645210'))
    // 5. API real como admin: senha forte + verified true
    resultados.push(testeHttp('api-forte-verified', 'Abcdefgh12', true, '612852470'))
    // 6. API real como admin: senha curta + sem verified
    resultados.push(testeHttp('api-curta-sem-verified', '15031985', false, '512852970'))

    // 7. Persistir o resultado
    const colRes = $app.findCollectionByNameOrId('users')
    const recRes = new Record(colRes)
    recRes.set('email', 'debug-senha-result@debug.invalido')
    recRes.set('emailVisibility', true)
    recRes.set('name', 'Debug Result')
    recRes.set('role', 'empresa')
    recRes.set('status', 'ativo')
    recRes.set('cpf', cpfValido('612852470'))
    recRes.set('password', 'Debug-Senha-2026')
    recRes.set('passwordConfirm', 'Debug-Senha-2026')
    recRes.set('verified', true)
    recRes.set('observacao_teste', JSON.stringify(resultados).slice(0, 60000))
    $app.save(recRes)
    console.log('[debug-senha] diagnostico gravado')
  } catch (err) {
    console.log('[debug-senha] erro: ' + String(err))
  }
})
