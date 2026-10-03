migrate(
  (app) => {
    const postos = app.findCollectionByNameOrId('postos')
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // 1. Adicionar pro_fixo (relação com users)
    if (!postos.fields.getByName('pro_fixo')) {
      postos.fields.add(
        new RelationField({
          name: 'pro_fixo',
          collectionId: users.id,
          maxSelect: 1,
          cascadeDelete: false,
          required: false,
        }),
      )
    }

    // 2. Adicionar tipo_remuneracao_fixa: select ['mensal', 'por_hora']
    if (!postos.fields.getByName('tipo_remuneracao_fixa')) {
      postos.fields.add(
        new SelectField({
          name: 'tipo_remuneracao_fixa',
          values: ['mensal', 'por_hora'],
          maxSelect: 1,
          required: false,
        }),
      )
    }

    // 3. Adicionar valor_remuneracao_fixa: number (valor mensal ou valor da hora)
    if (!postos.fields.getByName('valor_remuneracao_fixa')) {
      postos.fields.add(
        new NumberField({
          name: 'valor_remuneracao_fixa',
          required: false,
        }),
      )
    }

    postos.addIndex('idx_postos_pro_fixo', false, 'pro_fixo', '')
    app.save(postos)
  },
  (app) => {
    const postos = app.findCollectionByNameOrId('postos')
    try {
      postos.removeIndex('idx_postos_pro_fixo')
    } catch (_) {}

    const fieldsToRemove = ['pro_fixo', 'tipo_remuneracao_fixa', 'valor_remuneracao_fixa']
    for (const f of fieldsToRemove) {
      try {
        const field = postos.fields.getByName(f)
        if (field) postos.fields.remove(field)
      } catch (_) {}
    }
    app.save(postos)
  },
)
