migrate(
  (app) => {
    try {
      const existing = app.findAuthRecordByEmail(
        '_pb_users_auth_',
        'pro.teste.validacao@facilitiespro.com.br',
      )
      app.delete(existing)
    } catch (_) {}
  },
  (app) => {},
)
