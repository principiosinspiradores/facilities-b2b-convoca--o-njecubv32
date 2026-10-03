migrate(
  (app) => {
    let escalasId = ''
    try {
      escalasId = app.findCollectionByNameOrId('escalas').id
    } catch (_) {}

    // Coleção historico_escalas: registra reaberturas, convocações manuais e eventos operacionais
    const historico = new Collection({
      name: 'historico_escalas',
      type: 'base',
      listRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa')",
      viewRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa')",
      createRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa')",
      updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        {
          name: 'escala',
          type: 'relation',
          collectionId: escalasId,
          maxSelect: 1,
          required: true,
          cascadeDelete: true,
        },
        {
          name: 'usuario',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          required: true,
        },
        {
          name: 'acao',
          type: 'select',
          values: [
            'reabertura_manual',
            'convocacao_manual',
            'reoferta_emergencial',
            'falta_registrada',
            'pro_fixo_recusou',
          ],
          maxSelect: 1,
          required: true,
        },
        { name: 'descricao', type: 'text' },
        { name: 'detalhes', type: 'json' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_historico_escalas_escala ON historico_escalas (escala)',
        'CREATE INDEX idx_historico_escalas_usuario ON historico_escalas (usuario)',
        'CREATE INDEX idx_historico_escalas_created ON historico_escalas (created DESC)',
      ],
    })

    app.save(historico)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('historico_escalas')
      app.delete(col)
    } catch (_) {}
  },
)
