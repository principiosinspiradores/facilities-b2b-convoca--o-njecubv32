// pocketbase/migrations/0032_adicionar_observacao_teste_users.js
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!users.fields.getByName('observacao_teste')) {
      users.fields.add(
        new TextField({
          name: 'observacao_teste',
          required: false,
        }),
      )
      app.save(users)
    }
  },
  (app) => {
    try {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      const campo = users.fields.getByName('observacao_teste')
      if (campo) {
        users.fields.removeByName('observacao_teste')
        app.save(users)
      }
    } catch (_) {}
  },
)
