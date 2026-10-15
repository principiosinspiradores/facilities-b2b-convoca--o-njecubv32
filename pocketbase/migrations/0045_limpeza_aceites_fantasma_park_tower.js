migrate(
  (app) => {
    // Migration 0045: Limpeza dos aceites fantasma do Hotel Park Tower
    // Atualizar as convocações o5dsf3q0u0utje2 e ucwszt0pvl1dum4 para status='cancelada'
    // com regra_aplicada='Aceite duplicado bloqueado pela trava'.
    // Nenhum outro registro tocado.
    const ids = ['o5dsf3q0u0utje2', 'ucwszt0pvl1dum4']

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      try {
        const conv = app.findRecordById('convocacoes', id)
        conv.set('status', 'cancelada')
        conv.set('regra_aplicada', 'Aceite duplicado bloqueado pela trava')
        app.save(conv)
        console.log(`[MIGRATION_0045] Convocação ${id} atualizada para cancelada com sucesso.`)
      } catch (err) {
        console.log(`[MIGRATION_0045] Aviso: Convocação ${id} não encontrada ou erro:`, err)
      }
    }
  },
  (app) => {
    // Revert opcional
    const ids = ['o5dsf3q0u0utje2', 'ucwszt0pvl1dum4']
    for (let i = 0; i < ids.length; i++) {
      try {
        const conv = app.findRecordById('convocacoes', ids[i])
        conv.set('status', 'aceita')
        conv.set('regra_aplicada', 'valor negociado')
        app.save(conv)
      } catch (_) {}
    }
  },
)
