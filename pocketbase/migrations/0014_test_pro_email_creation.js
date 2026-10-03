migrate(
  (app) => {
    // Buscar coleção users
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // Limpar pro de teste anterior se existir
    try {
      const existing = app.findAuthRecordByEmail(
        '_pb_users_auth_',
        'pro.teste.validacao@facilitiespro.com.br',
      )
      app.delete(existing)
    } catch (_) {}

    // Criar um pro com duas funções do catálogo: "Camareira" e "Porteiro"
    const record = new Record(users)
    record.setEmail('pro.teste.validacao@facilitiespro.com.br')
    record.setPassword('Pro@Teste1234#')
    record.setVerified(false)
    record.set('name', 'Ana Validação')
    record.set('role', 'pro')
    record.set('status', 'teste')
    record.set('funcoes', ['Camareira', 'Porteiro'])
    record.set('periodo_teste_dias', 10)
    record.set('endereco_completo', {
      regiao: 'Grande São Paulo',
      cidade: 'São Paulo',
      uf: 'SP',
    })
    app.save(record)
  },
  (app) => {
    try {
      const existing = app.findAuthRecordByEmail(
        '_pb_users_auth_',
        'pro.teste.validacao@facilitiespro.com.br',
      )
      app.delete(existing)
    } catch (_) {}
  },
)
