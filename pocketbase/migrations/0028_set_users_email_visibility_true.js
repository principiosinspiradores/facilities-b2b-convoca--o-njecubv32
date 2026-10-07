migrate(
  (app) => {
    // 1. Atualizar emailVisibility = true em todos os registros existentes da tabela users
    // SQLite armazena boolean como 1/0 ou PocketBase aceita 1 (true)
    app
      .db()
      .newQuery(`
      UPDATE users SET emailVisibility = 1
    `)
      .execute()
  },
  (app) => {
    // Reverter (opcional - manter como 0 ou sem alteração destrutiva)
    try {
      app
        .db()
        .newQuery(`
        UPDATE users SET emailVisibility = 0
      `)
        .execute()
    } catch (_) {}
  },
)
