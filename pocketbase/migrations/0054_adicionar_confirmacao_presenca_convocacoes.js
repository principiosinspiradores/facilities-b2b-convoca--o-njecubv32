migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('convocacoes')

    if (!col.fields.getByName('confirmacao_presenca')) {
      col.fields.add(
        new SelectField({
          name: 'confirmacao_presenca',
          values: ['nao_confirmada', 'confirmada', 'nao_vai'],
          maxSelect: 1,
        }),
      )
    }

    if (!col.fields.getByName('confirmacao_data')) {
      col.fields.add(
        new DateField({
          name: 'confirmacao_data',
        }),
      )
    }

    app.save(col)

    // Backfill para convocações existentes com confirmacao_presenca vazio
    try {
      app
        .db()
        .newQuery(
          "UPDATE convocacoes SET confirmacao_presenca = 'nao_confirmada' WHERE confirmacao_presenca IS NULL OR confirmacao_presenca = ''",
        )
        .execute()
    } catch (_) {}
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('convocacoes')
      const f1 = col.fields.getByName('confirmacao_presenca')
      if (f1) col.fields.removeByName('confirmacao_presenca')
      const f2 = col.fields.getByName('confirmacao_data')
      if (f2) col.fields.removeByName('confirmacao_data')
      app.save(col)
    } catch (_) {}
  },
)
