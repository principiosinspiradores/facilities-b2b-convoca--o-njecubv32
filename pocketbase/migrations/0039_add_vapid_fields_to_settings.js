migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('settings')

    if (!col.fields.getByName('vapid_public_key')) {
      col.fields.add(
        new TextField({
          name: 'vapid_public_key',
          required: false,
        }),
      )
    }

    if (!col.fields.getByName('vapid_private_key')) {
      col.fields.add(
        new TextField({
          name: 'vapid_private_key',
          required: false,
        }),
      )
    }

    if (!col.fields.getByName('vapid_subject')) {
      col.fields.add(
        new TextField({
          name: 'vapid_subject',
          required: false,
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('settings')

    if (col.fields.getByName('vapid_public_key')) {
      col.fields.removeByName('vapid_public_key')
    }
    if (col.fields.getByName('vapid_private_key')) {
      col.fields.removeByName('vapid_private_key')
    }
    if (col.fields.getByName('vapid_subject')) {
      col.fields.removeByName('vapid_subject')
    }

    app.save(col)
  },
)
