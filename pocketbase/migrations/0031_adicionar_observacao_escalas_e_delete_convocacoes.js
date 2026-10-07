migrate(
  (app) => {
    // 1. Adicionar campo 'observacao' opcional na coleção 'escalas'
    const escalas = app.findCollectionByNameOrId('escalas')
    if (!escalas.fields.getByName('observacao')) {
      escalas.fields.add(
        new TextField({
          name: 'observacao',
          required: false,
        }),
      )
      app.save(escalas)
    }

    // 2. Permitir que empresa delete convocações se necessário
    const convocacoes = app.findCollectionByNameOrId('convocacoes')
    convocacoes.deleteRule =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa')"
    app.save(convocacoes)
  },
  (app) => {
    try {
      const escalas = app.findCollectionByNameOrId('escalas')
      const campo = escalas.fields.getByName('observacao')
      if (campo) {
        escalas.fields.remove(campo)
        app.save(escalas)
      }
    } catch (_) {}

    try {
      const convocacoes = app.findCollectionByNameOrId('convocacoes')
      convocacoes.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
      app.save(convocacoes)
    } catch (_) {}
  },
)
