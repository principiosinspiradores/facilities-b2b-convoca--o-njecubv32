migrate(
  (app) => {
    // 1. Adicionar raio_geocerca_m na coleção postos
    const postos = app.findCollectionByNameOrId('postos')
    if (!postos.fields.getByName('raio_geocerca_m')) {
      postos.fields.add(
        new NumberField({
          name: 'raio_geocerca_m',
          required: false,
        }),
      )
      app.save(postos)
    }

    // Atualizar postos existentes com raio padrão de 150m se não preenchido
    try {
      app
        .db()
        .newQuery(
          'UPDATE postos SET raio_geocerca_m = 150 WHERE raio_geocerca_m IS NULL OR raio_geocerca_m = 0',
        )
        .execute()
    } catch (_) {}

    // 2. Criar coleção 'pontos' (modelo Profreela)
    const escalas = app.findCollectionByNameOrId('escalas')
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    const pontos = new Collection({
      name: 'pontos',
      type: 'base',
      // Pro vê e cria apenas o próprio ponto. Empresa e Admin visualizam e atualizam (aprovar/contestar).
      listRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || pro = @request.auth.id)",
      viewRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || pro = @request.auth.id)",
      createRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || pro = @request.auth.id)",
      updateRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || pro = @request.auth.id)",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        {
          name: 'escala',
          type: 'relation',
          collectionId: escalas.id,
          maxSelect: 1,
          cascadeDelete: false,
          required: true,
        },
        {
          name: 'pro',
          type: 'relation',
          collectionId: users.id,
          maxSelect: 1,
          cascadeDelete: false,
          required: true,
        },
        {
          name: 'tipo',
          type: 'select',
          values: ['chegada', 'saida'],
          maxSelect: 1,
          required: true,
        },
        {
          name: 'timestamp_real',
          type: 'date',
          required: true,
        },
        {
          name: 'latitude',
          type: 'number',
          required: false,
        },
        {
          name: 'longitude',
          type: 'number',
          required: false,
        },
        {
          name: 'dentro_raio',
          type: 'bool',
          required: false,
        },
        {
          name: 'distancia_metros',
          type: 'number',
          required: false,
        },
        {
          name: 'foto',
          type: 'file',
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        },
        {
          name: 'ocorrencia',
          type: 'text',
          required: false,
        },
        {
          name: 'status_validacao',
          type: 'select',
          values: ['valido', 'alerta', 'contestado', 'aprovado_manual'],
          maxSelect: 1,
          required: false,
        },
        {
          name: 'observacao_gestao',
          type: 'text',
          required: false,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_pontos_escala ON pontos (escala)',
        'CREATE INDEX idx_pontos_pro ON pontos (pro)',
        'CREATE INDEX idx_pontos_timestamp ON pontos (timestamp_real)',
      ],
    })

    app.save(pontos)
  },
  (app) => {
    try {
      const pontos = app.findCollectionByNameOrId('pontos')
      app.delete(pontos)
    } catch (_) {}

    try {
      const postos = app.findCollectionByNameOrId('postos')
      const field = postos.fields.getByName('raio_geocerca_m')
      if (field) {
        postos.fields.remove(field)
        app.save(postos)
      }
    } catch (_) {}
  },
)
