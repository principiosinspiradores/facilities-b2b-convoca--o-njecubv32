migrate(
  (app) => {
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const usersId = usersCol.id

    let escalasId = ''
    try {
      escalasId = app.findCollectionByNameOrId('escalas').id
    } catch (_) {}

    let convocacoesId = ''
    try {
      convocacoesId = app.findCollectionByNameOrId('convocacoes').id
    } catch (_) {}

    // 1. Coleção mensagens_conversas
    // Participantes: relação users (maxSelect > 1, ex: 10)
    // tipo: select ('contextual', 'direta')
    // pro: relação users (o profissional participante)
    // convocacao: relação convocacoes (opcional)
    // escala: relação escalas (opcional)
    // ultima_mensagem_texto: text
    // ultima_mensagem_data: text ou date
    // leitura_empresa_em: text ou date
    // leitura_pro_em: text ou date
    // titulo_contexto: text (ex: nome do posto / data)
    const conversasFields = [
      {
        name: 'tipo',
        type: 'select',
        values: ['contextual', 'direta'],
        maxSelect: 1,
        required: true,
      },
      {
        name: 'pro',
        type: 'relation',
        collectionId: usersId,
        maxSelect: 1,
        required: true,
      },
      {
        name: 'participantes',
        type: 'relation',
        collectionId: usersId,
        maxSelect: 10,
      },
      {
        name: 'titulo_contexto',
        type: 'text',
      },
      {
        name: 'ultima_mensagem_texto',
        type: 'text',
      },
      {
        name: 'ultima_mensagem_data',
        type: 'date',
      },
      {
        name: 'leitura_empresa_em',
        type: 'date',
      },
      {
        name: 'leitura_pro_em',
        type: 'date',
      },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ]

    if (escalasId) {
      conversasFields.splice(3, 0, {
        name: 'escala',
        type: 'relation',
        collectionId: escalasId,
        maxSelect: 1,
      })
    }
    if (convocacoesId) {
      conversasFields.splice(4, 0, {
        name: 'convocacao',
        type: 'relation',
        collectionId: convocacoesId,
        maxSelect: 1,
      })
    }

    const conversas = new Collection({
      name: 'mensagens_conversas',
      type: 'base',
      listRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || pro = @request.auth.id || participantes.id ?= @request.auth.id)",
      viewRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || pro = @request.auth.id || participantes.id ?= @request.auth.id)",
      createRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || (@request.auth.role = 'pro' && pro = @request.auth.id))",
      updateRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || pro = @request.auth.id || participantes.id ?= @request.auth.id)",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: conversasFields,
      indexes: [],
    })
    app.save(conversas)
    const conversasId = conversas.id

    // 2. Coleção mensagens_mensagens
    // conversa: relation mensagens_conversas
    // remetente: relation users
    // destinatario_tipo: select ('empresa', 'pro', 'todos')
    // texto: text required
    // lida: bool
    // lida_em: date
    const mensagens = new Collection({
      name: 'mensagens_mensagens',
      type: 'base',
      listRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || conversa.pro = @request.auth.id || remetente = @request.auth.id)",
      viewRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || conversa.pro = @request.auth.id || remetente = @request.auth.id)",
      createRule:
        "@request.auth.id != '' && remetente = @request.auth.id && (@request.auth.role = 'admin' || @request.auth.role = 'empresa' || (@request.auth.role = 'pro' && conversa.pro = @request.auth.id))",
      updateRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || remetente = @request.auth.id || @request.auth.role = 'empresa' || conversa.pro = @request.auth.id)",
      deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
      fields: [
        {
          name: 'conversa',
          type: 'relation',
          collectionId: conversasId,
          maxSelect: 1,
          required: true,
          cascadeDelete: true,
        },
        {
          name: 'remetente',
          type: 'relation',
          collectionId: usersId,
          maxSelect: 1,
          required: true,
        },
        {
          name: 'destinatario_tipo',
          type: 'select',
          values: ['empresa', 'pro', 'admin'],
          maxSelect: 1,
        },
        {
          name: 'texto',
          type: 'text',
          required: true,
          max: 4000,
        },
        {
          name: 'lida',
          type: 'bool',
        },
        {
          name: 'lida_em',
          type: 'date',
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_mensagens_conversa ON mensagens_mensagens (conversa)',
        'CREATE INDEX idx_mensagens_remetente ON mensagens_mensagens (remetente)',
        'CREATE INDEX idx_mensagens_created ON mensagens_mensagens (created DESC)',
      ],
    })
    app.save(mensagens)

    // Seed de conversa de boas-vindas / exemplo se houver profissionais
    try {
      const proUser = app.findFirstRecordByData('users', 'role', 'pro')
      const empresaUser = app.findFirstRecordByData('users', 'role', 'empresa')
      if (proUser && empresaUser) {
        const cRec = new Record(conversas)
        cRec.set('tipo', 'direta')
        cRec.set('pro', proUser.id)
        cRec.set('participantes', [proUser.id, empresaUser.id])
        cRec.set('titulo_contexto', 'Suporte & Operações')
        cRec.set(
          'ultima_mensagem_texto',
          'Olá! Canal de mensagens direto da empresa Facilities Pro.',
        )
        cRec.set('ultima_mensagem_data', new Date().toISOString())
        cRec.set('leitura_empresa_em', new Date().toISOString())
        app.save(cRec)

        const mRec = new Record(mensagens)
        mRec.set('conversa', cRec.id)
        mRec.set('remetente', empresaUser.id)
        mRec.set('destinatario_tipo', 'pro')
        mRec.set('texto', 'Olá! Canal de mensagens direto da empresa Facilities Pro.')
        mRec.set('lida', false)
        app.save(mRec)
      }
    } catch (_) {}
  },
  (app) => {
    try {
      const mensagens = app.findCollectionByNameOrId('mensagens_mensagens')
      app.delete(mensagens)
    } catch (_) {}
    try {
      const conversas = app.findCollectionByNameOrId('mensagens_conversas')
      app.delete(conversas)
    } catch (_) {}
  },
)
