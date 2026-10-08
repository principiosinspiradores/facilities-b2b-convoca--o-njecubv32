// pocketbase/migrations/0033_create_push_subscriptions.js
migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const usersId = usersCol.id

    const pushSubscriptions = new Collection({
      name: 'push_subscriptions',
      type: 'base',
      listRule: "@request.auth.id != '' && user = @request.auth.id",
      viewRule: "@request.auth.id != '' && user = @request.auth.id",
      createRule: "@request.auth.id != '' && @request.body.user = @request.auth.id",
      updateRule: "@request.auth.id != '' && user = @request.auth.id",
      deleteRule: "@request.auth.id != '' && user = @request.auth.id",
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
          required: true,
          max: 2000,
        },
        {
          name: 'keys_p256dh',
          type: 'text',
          required: true,
          max: 500,
        },
        {
          name: 'keys_auth',
          type: 'text',
          required: true,
          max: 500,
        },
        {
          name: 'useragent',
          type: 'text',
          required: false,
          max: 1000,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_push_sub_endpoint ON push_subscriptions (endpoint)',
        'CREATE INDEX idx_push_sub_user ON push_subscriptions (user)',
      ],
    })

    app.save(pushSubscriptions)
  },
  (app) => {
    try {
      const pushSubscriptions = app.findCollectionByNameOrId('push_subscriptions')
      app.delete(pushSubscriptions)
    } catch (_) {}
  },
)
