migrate(
  (app) => {
    // Restaurar/definir funcao nos postos existentes
    try {
      app
        .db()
        .newQuery(
          "UPDATE postos SET funcao = 'Porteiro' WHERE nome LIKE '%Portaria%' OR nome LIKE '%Torre Alfa%'",
        )
        .execute()
      app
        .db()
        .newQuery(
          "UPDATE postos SET funcao = 'Limpeza' WHERE nome LIKE '%Limpeza%' OR nome LIKE '%Galpão Beta%'",
        )
        .execute()
      app
        .db()
        .newQuery("UPDATE postos SET funcao = 'Porteiro' WHERE funcao IS NULL OR funcao = ''")
        .execute()
    } catch (err) {
      console.log('Erro ao atualizar funcao dos postos:', err)
    }
  },
  (app) => {},
)
