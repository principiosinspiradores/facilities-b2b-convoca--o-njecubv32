migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // 1. Adicionar campos adicionais para contato e qualificação do Pro caso ainda não existam
    if (!users.fields.getByName('telefone')) {
      users.fields.add(
        new TextField({
          name: 'telefone',
          required: false,
        }),
      )
    }

    if (!users.fields.getByName('funcoes')) {
      users.fields.add(
        new JSONField({
          name: 'funcoes',
          required: false,
        }),
      )
    }

    if (!users.fields.getByName('endereco_completo')) {
      users.fields.add(
        new JSONField({
          name: 'endereco_completo',
          required: false,
        }),
      )
    }

    // 2. Atualizar regras da coleção users:
    // - create: Admin pode criar qualquer usuário; Empresa pode criar pro (@request.body.role = 'pro')
    // - update: Admin pode tudo; Empresa pode atualizar pros (role = 'pro'); Próprio usuário atualiza a si mesmo
    // - list & view: Admin, Empresa ou o próprio usuário
    users.createRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || (@request.auth.role = 'empresa' && @request.body.role = 'pro'))"

    users.updateRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || (@request.auth.role = 'empresa' && role = 'pro') || @request.auth.id = id)"

    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.createRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    app.save(users)
  },
)
