migrate(
  (app) => {
    // Executar a transição da convocação w0vfh1jy1kxqw3i para 'falta'
    // Disparando o hook hook_no_show.js no servidor real PocketBase
    const conv = app.findRecordById('convocacoes', 'w0vfh1jy1kxqw3i')
    conv.set('status', 'falta')
    app.save(conv)
  },
  (app) => {
    // Revert não necessário, migration de execução real
  },
)
