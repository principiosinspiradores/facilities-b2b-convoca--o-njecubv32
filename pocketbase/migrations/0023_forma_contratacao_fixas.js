migrate(
  (app) => {
    const postos = app.findCollectionByNameOrId('postos')

    // 1. forma_de_contratacao: select (freelancer, mensalista, horista), default freelancer
    if (!postos.fields.getByName('forma_de_contratacao')) {
      postos.fields.add(
        new SelectField({
          name: 'forma_de_contratacao',
          values: ['freelancer', 'mensalista', 'horista'],
          maxSelect: 1,
          required: false,
        }),
      )
    }

    // 2. salario_mensal: number (R$)
    if (!postos.fields.getByName('salario_mensal')) {
      postos.fields.add(
        new NumberField({
          name: 'salario_mensal',
          required: false,
        }),
      )
    }

    // 3. valor_hora: number (R$/h)
    if (!postos.fields.getByName('valor_hora')) {
      postos.fields.add(
        new NumberField({
          name: 'valor_hora',
          required: false,
        }),
      )
    }

    app.save(postos)

    // 4. Backfill de postos existentes a partir dos campos legados
    // por_hora -> horista/valor_hora
    // mensal -> mensalista/salario_mensal
    // sem pro_fixo -> freelancer
    app
      .db()
      .newQuery(`
      UPDATE postos
      SET forma_de_contratacao = 'horista',
          valor_hora = COALESCE(valor_remuneracao_fixa, 0)
      WHERE pro_fixo IS NOT NULL AND pro_fixo != '' AND tipo_remuneracao_fixa = 'por_hora'
    `)
      .execute()

    app
      .db()
      .newQuery(`
      UPDATE postos
      SET forma_de_contratacao = 'mensalista',
          salario_mensal = COALESCE(valor_remuneracao_fixa, 0)
      WHERE pro_fixo IS NOT NULL AND pro_fixo != '' AND (tipo_remuneracao_fixa = 'mensal' OR tipo_remuneracao_fixa IS NULL OR tipo_remuneracao_fixa = '')
    `)
      .execute()

    app
      .db()
      .newQuery(`
      UPDATE postos
      SET forma_de_contratacao = 'freelancer'
      WHERE (pro_fixo IS NULL OR pro_fixo = '') AND (forma_de_contratacao IS NULL OR forma_de_contratacao = '')
    `)
      .execute()
  },
  (app) => {
    const postos = app.findCollectionByNameOrId('postos')
    const fieldsToRemove = ['forma_de_contratacao', 'salario_mensal', 'valor_hora']
    for (const f of fieldsToRemove) {
      try {
        const field = postos.fields.getByName(f)
        if (field) postos.fields.remove(field)
      } catch (_) {}
    }
    app.save(postos)
  },
)
