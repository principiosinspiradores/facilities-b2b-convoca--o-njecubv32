migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    if (!users.fields.getByName('ultimo_acesso')) {
      users.fields.add(
        new DateField({
          name: 'ultimo_acesso',
          required: false,
        }),
      )
      app.save(users)
    }
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const field = users.fields.getByName('ultimo_acesso')
    if (field) {
      users.fields.removeByName('ultimo_acesso')
      app.save(users)
    }
  },
)
