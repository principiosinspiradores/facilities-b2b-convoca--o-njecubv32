migrate(
  (app) => {
    // Atualizar postos existentes que estão com 0 para 10 min
    try {
      app
        .db()
        .newQuery(
          'UPDATE postos SET tolerancia_entrada_minutos = 10 WHERE tolerancia_entrada_minutos IS NULL OR tolerancia_entrada_minutos = 0',
        )
        .execute()
    } catch (_) {}

    try {
      app
        .db()
        .newQuery(
          'UPDATE postos SET tolerancia_saida_minutos = 10 WHERE tolerancia_saida_minutos IS NULL OR tolerancia_saida_minutos = 0',
        )
        .execute()
    } catch (_) {}
  },
  (app) => {},
)
