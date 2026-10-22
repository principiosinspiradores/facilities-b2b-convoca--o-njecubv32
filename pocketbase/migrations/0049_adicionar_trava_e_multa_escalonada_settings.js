migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('settings')

    if (!col.fields.getByName('horas_trava_cancelamento')) {
      col.fields.add(
        new NumberField({
          name: 'horas_trava_cancelamento',
          min: 0,
          required: false,
        }),
      )
    }

    if (!col.fields.getByName('horas_multa_cancelamento')) {
      col.fields.add(
        new NumberField({
          name: 'horas_multa_cancelamento',
          min: 0,
          required: false,
        }),
      )
    }

    if (!col.fields.getByName('multa_cancelamento_12h')) {
      col.fields.add(
        new NumberField({
          name: 'multa_cancelamento_12h',
          min: 0,
          required: false,
        }),
      )
    }

    app.save(col)

    // Preencher valores padrão nos registros existentes de settings (6, 12, 50)
    try {
      app
        .db()
        .newQuery(`
        UPDATE settings
        SET horas_trava_cancelamento = 6,
            horas_multa_cancelamento = 12,
            multa_cancelamento_12h = 50
        WHERE horas_trava_cancelamento IS NULL OR horas_trava_cancelamento = 0
      `)
        .execute()
    } catch (_) {}
  },
  (app) => {
    const col = app.findCollectionByNameOrId('settings')

    if (col.fields.getByName('horas_trava_cancelamento')) {
      col.fields.removeByName('horas_trava_cancelamento')
    }
    if (col.fields.getByName('horas_multa_cancelamento')) {
      col.fields.removeByName('horas_multa_cancelamento')
    }
    if (col.fields.getByName('multa_cancelamento_12h')) {
      col.fields.removeByName('multa_cancelamento_12h')
    }

    app.save(col)
  },
)
