migrate(
  (app) => {
    try {
      const settings = app.settings()
      if (settings && settings.meta) {
        settings.meta.appURL = 'https://app.housekeeping.com.br'
        app.save(settings)
      }
    } catch (err) {
      console.log('Aviso ao atualizar settings.meta.appURL na migração 0025:', err)
    }
  },
  (app) => {
    try {
      const settings = app.settings()
      if (settings && settings.meta) {
        settings.meta.appURL = 'https://facilities-b2b-convocacao-ae810.goskip.app'
        app.save(settings)
      }
    } catch (_) {}
  },
)
