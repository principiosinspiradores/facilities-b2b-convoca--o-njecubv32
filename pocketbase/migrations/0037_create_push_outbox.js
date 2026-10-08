// pocketbase/migrations/0037_create_push_outbox.js
migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const usersId = usersCol.id

    const pushOutbox = new Collection({
      name: 'push_outbox',
      type: 'base',
      listRule: "@request.auth.id != '' && user = @request.auth.id",
      viewRule: "@request.auth.id != '' && user = @request.auth.id",
      createRule: null,
      updateRule: "@request.auth.id != '' && user = @request.auth.id",
      deleteRule: null,
      fields: [
        {
          name: 'user',
          type: 'relation',
          collectionId: usersId,
          maxSelect: 1,
          required: true,
          cascadeDelete: true,
        },
        {
          name: 'endpoint',
          type: 'text',
          required: false,
          max: 2000,
        },
        {
          name: 'title',
          type: 'text',
          required: true,
          max: 250,
        },
        {
          name: 'body',
          type: 'text',
          required: true,
          max: 1000,
        },
        {
          name: 'url',
          type: 'text',
          required: false,
          max: 500,
        },
        {
          name: 'tag',
          type: 'text',
          required: false,
          max: 100,
        },
        {
          name: 'lido',
          type: 'bool',
          required: false,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_push_outbox_user_lido ON push_outbox (user, lido, created DESC)',
        'CREATE INDEX idx_push_outbox_endpoint_lido ON push_outbox (endpoint, lido, created DESC)',
      ],
    })

    app.save(pushOutbox)
  },
  (app) => {
    try {
      const pushOutbox = app.findCollectionByNameOrId('push_outbox')
      app.delete(pushOutbox)
    } catch (_) {}
  },
)
