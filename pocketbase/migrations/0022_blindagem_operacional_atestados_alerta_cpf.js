/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 1. Adicionar campo 'prazo_atestado_horas' na coleção 'settings'
    const settings = app.findCollectionByNameOrId('settings')
    if (!settings.fields.getByName('prazo_atestado_horas')) {
      settings.fields.add(
        new NumberField({
          name: 'prazo_atestado_horas',
          min: 1,
          max: 720,
        }),
      )
      app.save(settings)

      // Atualizar registro existente de settings com default 48 horas
      try {
        const records = app.findRecordsByFilter('settings', '', '-created', 1, 0)
        if (records && records.length > 0) {
          records[0].set('prazo_atestado_horas', 48)
          app.save(records[0])
        }
      } catch (_) {}
    }

    // 2. Modificar coleção 'pontos':
    // - Tornar o campo 'escala' não obrigatório (required: false) para permitir registrar ponto de alerta sem escala vinculada
    // - Adicionar campo booleano 'aviso_sem_convocacao'
    // - Adicionar campo de relação opcional 'posto'
    const pontos = app.findCollectionByNameOrId('pontos')

    const escalaField = pontos.fields.getByName('escala')
    if (escalaField) {
      escalaField.required = false
    }

    if (!pontos.fields.getByName('aviso_sem_convocacao')) {
      pontos.fields.add(
        new BoolField({
          name: 'aviso_sem_convocacao',
        }),
      )
    }

    const postosCol = app.findCollectionByNameOrId('postos')
    if (!pontos.fields.getByName('posto')) {
      pontos.fields.add(
        new RelationField({
          name: 'posto',
          collectionId: postosCol.id,
          cascadeDelete: false,
          maxSelect: 1,
          required: false,
        }),
      )
    }
    app.save(pontos)

    // 3. Modificar coleção 'users':
    // - Adicionar campo 'cpf' (texto)
    // - Criar índice único parcial no campo cpf (onde cpf != '')
    const users = app.findCollectionByNameOrId('users')
    if (!users.fields.getByName('cpf')) {
      users.fields.add(
        new TextField({
          name: 'cpf',
        }),
      )
      app.save(users)
    }

    try {
      users.addIndex('idx_users_cpf_unique', true, 'cpf', "cpf != ''")
      app.save(users)
    } catch (errIndex) {
      // Se o índice já existir ou outro motivo, prosseguir
    }

    // 4. Criar coleção 'atestados'
    let atestadosCol
    try {
      atestadosCol = app.findCollectionByNameOrId('atestados')
    } catch (_) {}

    if (!atestadosCol) {
      const convocacoesCol = app.findCollectionByNameOrId('convocacoes')

      const atestados = new Collection({
        name: 'atestados',
        type: 'base',
        fields: [
          {
            name: 'convocacao',
            type: 'relation',
            collectionId: convocacoesCol.id,
            cascadeDelete: false,
            maxSelect: 1,
            required: true,
          },
          {
            name: 'pro',
            type: 'relation',
            collectionId: users.id,
            cascadeDelete: false,
            maxSelect: 1,
            required: true,
          },
          {
            name: 'arquivo',
            type: 'file',
            maxSelect: 1,
            maxSize: 10485760, // 10MB
            mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'],
          },
          {
            name: 'data_envio',
            type: 'date',
          },
          {
            name: 'status_validacao',
            type: 'select',
            values: ['pendente', 'aprovado', 'rejeitado'],
            maxSelect: 1,
            required: true,
          },
          {
            name: 'validado_por',
            type: 'relation',
            collectionId: users.id,
            cascadeDelete: false,
            maxSelect: 1,
            required: false,
          },
          {
            name: 'observacao_validacao',
            type: 'text',
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_atestados_convocacao ON atestados (convocacao)',
          'CREATE INDEX idx_atestados_pro ON atestados (pro)',
          'CREATE INDEX idx_atestados_status ON atestados (status_validacao)',
        ],
        listRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || pro = @request.auth.id)",
        viewRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || pro = @request.auth.id)",
        createRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || pro = @request.auth.id)",
        updateRule:
          "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa')",
        deleteRule: null,
      })

      app.save(atestados)
    }
  },
  (app) => {
    try {
      const atestados = app.findCollectionByNameOrId('atestados')
      app.delete(atestados)
    } catch (_) {}

    try {
      const users = app.findCollectionByNameOrId('users')
      try {
        users.removeIndex('idx_users_cpf_unique')
      } catch (_) {}
      const cpfField = users.fields.getByName('cpf')
      if (cpfField) users.fields.remove(cpfField)
      app.save(users)
    } catch (_) {}

    try {
      const pontos = app.findCollectionByNameOrId('pontos')
      const avField = pontos.fields.getByName('aviso_sem_convocacao')
      if (avField) pontos.fields.remove(avField)
      const postoField = pontos.fields.getByName('posto')
      if (postoField) pontos.fields.remove(postoField)
      app.save(pontos)
    } catch (_) {}

    try {
      const settings = app.findCollectionByNameOrId('settings')
      const prazoField = settings.fields.getByName('prazo_atestado_horas')
      if (prazoField) settings.fields.remove(prazoField)
      app.save(settings)
    } catch (_) {}
  },
)
