// pocketbase/migrations/0038_create_convites_acesso.js
migrate(
  (app) => {
    if (app.hasTable('convites_acesso')) {
      return
    }

    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    const collection = new Collection({
      name: 'convites_acesso',
      type: 'base',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'user',
          type: 'relation',
          required: true,
          collectionId: users.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'token',
          type: 'text',
          required: true,
        },
        {
          name: 'expires_at',
          type: 'date',
          required: true,
        },
        {
          name: 'usado',
          type: 'bool',
          required: false,
        },
        {
          name: 'created',
          type: 'autodate',
          onCreate: true,
          onUpdate: false,
        },
        {
          name: 'updated',
          type: 'autodate',
          onCreate: true,
          onUpdate: true,
        },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_convites_acesso_token ON convites_acesso (token)',
        'CREATE INDEX idx_convites_acesso_user ON convites_acesso (user)',
        'CREATE INDEX idx_convites_acesso_expires ON convites_acesso (expires_at)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('convites_acesso')
      app.delete(col)
    } catch (_) {}
  },
)
