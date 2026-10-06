migrate(
  (app) => {
    // 1. Adicionar campo vagas em 'postos' (number, min 1, padrão 1)
    const postos = app.findCollectionByNameOrId('postos')
    if (!postos.fields.getByName('vagas')) {
      postos.fields.add(
        new NumberField({
          name: 'vagas',
          min: 1,
          onlyInt: true,
          required: false,
        }),
      )
      app.save(postos)
    }

    // 2. Adicionar campo vagas em 'escalas' (para herdar as vagas configuradas do posto ou definir individualmente)
    const escalas = app.findCollectionByNameOrId('escalas')
    if (!escalas.fields.getByName('vagas')) {
      escalas.fields.add(
        new NumberField({
          name: 'vagas',
          min: 1,
          onlyInt: true,
          required: false,
        }),
      )
      app.save(escalas)
    }

    // 3. Backfill para garantir que todos os postos e escalas existentes tenham vagas = 1
    app
      .db()
      .newQuery(`
      UPDATE postos SET vagas = 1 WHERE vagas IS NULL OR vagas < 1
    `)
      .execute()

    app
      .db()
      .newQuery(`
      UPDATE escalas SET vagas = 1 WHERE vagas IS NULL OR vagas < 1
    `)
      .execute()
  },
  (app) => {
    try {
      const postos = app.findCollectionByNameOrId('postos')
      const campoVagasPostos = postos.fields.getByName('vagas')
      if (campoVagasPostos) {
        postos.fields.remove(campoVagasPostos)
        app.save(postos)
      }
    } catch (_) {}

    try {
      const escalas = app.findCollectionByNameOrId('escalas')
      const campoVagasEscalas = escalas.fields.getByName('vagas')
      if (campoVagasEscalas) {
        escalas.fields.remove(campoVagasEscalas)
        app.save(escalas)
      }
    } catch (_) {}
  },
)
