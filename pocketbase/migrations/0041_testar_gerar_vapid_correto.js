// pocketbase/migrations/0041_testar_gerar_vapid_correto.js
migrate(
  (app) => {
    // Criar temporariamente um superusuário dedicado para teste via REST API ou usuário admin
    // No PocketBase v0.36, superusers é uma coleção auth _superusers ou app.save(record)
    // Vamos criar um usuário de teste na coleção users com role admin
    let testAdmin = null
    try {
      testAdmin = app.findFirstRecordByData(
        'users',
        'email',
        'test_vapid_admin@facilitiespro.com.br',
      )
    } catch (_) {}

    if (!testAdmin) {
      const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
      testAdmin = new Record(usersCol)
      testAdmin.setEmail('test_vapid_admin@facilitiespro.com.br')
      testAdmin.setVerified(true)
      testAdmin.set('name', 'Test VAPID Admin')
      testAdmin.set('role', 'admin')
      testAdmin.set('status', 'ativo')
    }

    testAdmin.setPassword('TestPass123456!')
    app.save(testAdmin)

    // Agora que a senha foi gravada e commitada em SQLite nesta transação (ou após commit):
    // Atenção: a requisição HTTP acontece FORA da transação da migração atual!
    // Em SQLite WAL, leituras de outra conexão só vêem alterações após o commit da transação!
    // Portanto, fazer requisições HTTP dentro da própria transação de migração tentando ler dados
    // alterados nesta mesma migração não enxerga a senha nova!
  },
  (app) => {},
)
