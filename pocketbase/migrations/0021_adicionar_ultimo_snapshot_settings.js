migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('settings')
    if (!col.fields.getByName('ultimo_snapshot_em')) {
      col.fields.add(
        new DateField({
          name: 'ultimo_snapshot_em',
          required: false,
        }),
      )
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('settings')
    const field = col.fields.getByName('ultimo_snapshot_em')
    if (field) {
      col.fields.removeByName('ultimo_snapshot_em')
      app.save(col)
    }
  },
)
