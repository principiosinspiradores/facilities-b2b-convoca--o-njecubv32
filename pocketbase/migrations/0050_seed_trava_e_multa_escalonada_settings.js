migrate(
  (app) => {
    try {
      app
        .db()
        .newQuery(`
        UPDATE settings
        SET horas_trava_cancelamento = 6,
            horas_multa_cancelamento = 12,
            multa_cancelamento_12h = 50
        WHERE horas_trava_cancelamento = 0 OR horas_trava_cancelamento IS NULL
      `)
        .execute()
    } catch (_) {}
  },
  () => {},
)
