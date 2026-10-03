migrate(
  (app) => {
    // 1. Atualizar coleção 'postos' com calibração de cerca e tolerâncias de horário
    const postos = app.findCollectionByNameOrId('postos')

    // tolerância de entrada / chegada em minutos (padrão 10 min)
    if (!postos.fields.getByName('tolerancia_entrada_minutos')) {
      postos.fields.add(
        new NumberField({
          name: 'tolerancia_entrada_minutos',
          required: false,
        }),
      )
    }

    // tolerância de saída separada em minutos (opcional / se null usa a de entrada ou padrão)
    if (!postos.fields.getByName('tolerancia_saida_minutos')) {
      postos.fields.add(
        new NumberField({
          name: 'tolerancia_saida_minutos',
          required: false,
        }),
      )
    }

    app.save(postos)

    // Semear/atualizar postos existentes com valores padrão (raio 100m, tolerância 10 min)
    try {
      app
        .db()
        .newQuery(
          'UPDATE postos SET raio_geocerca_m = 100 WHERE raio_geocerca_m IS NULL OR raio_geocerca_m = 0',
        )
        .execute()
    } catch (_) {}

    try {
      app
        .db()
        .newQuery(
          'UPDATE postos SET tolerancia_entrada_minutos = 10 WHERE tolerancia_entrada_minutos IS NULL',
        )
        .execute()
    } catch (_) {}

    try {
      app
        .db()
        .newQuery(
          'UPDATE postos SET tolerancia_saida_minutos = 10 WHERE tolerancia_saida_minutos IS NULL',
        )
        .execute()
    } catch (_) {}

    // 2. Atualizar coleção 'pontos' com campo booleano 'fora_janela' e 'raio_posto_m' para registro histórico
    const pontos = app.findCollectionByNameOrId('pontos')

    if (!pontos.fields.getByName('fora_janela')) {
      pontos.fields.add(
        new BoolField({
          name: 'fora_janela',
          required: false,
        }),
      )
    }

    if (!pontos.fields.getByName('raio_posto_m')) {
      pontos.fields.add(
        new NumberField({
          name: 'raio_posto_m',
          required: false,
        }),
      )
    }

    if (!pontos.fields.getByName('tolerancia_aplicada_minutos')) {
      pontos.fields.add(
        new NumberField({
          name: 'tolerancia_aplicada_minutos',
          required: false,
        }),
      )
    }

    app.save(pontos)

    try {
      pontos.addIndex('idx_pontos_fora_janela', false, 'fora_janela', '')
      app.save(pontos)
    } catch (_) {}
  },
  (app) => {
    try {
      const pontos = app.findCollectionByNameOrId('pontos')
      pontos.removeIndex('idx_pontos_fora_janela')
      const pFields = ['fora_janela', 'raio_posto_m', 'tolerancia_aplicada_minutos']
      for (const fn of pFields) {
        const f = pontos.fields.getByName(fn)
        if (f) pontos.fields.remove(f)
      }
      app.save(pontos)
    } catch (_) {}

    try {
      const postos = app.findCollectionByNameOrId('postos')
      const fields = ['tolerancia_entrada_minutos', 'tolerancia_saida_minutos']
      for (const fn of fields) {
        const f = postos.fields.getByName(fn)
        if (f) postos.fields.remove(f)
      }
      app.save(postos)
    } catch (_) {}
  },
)
